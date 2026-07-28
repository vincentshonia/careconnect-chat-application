
CREATE TYPE public.app_role AS ENUM ('agent','team_lead','manager','administrator','super_admin');
CREATE TYPE public.entity_status AS ENUM ('active','inactive','suspended','archived');

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status public.entity_status NOT NULL DEFAULT 'active',
  description text,
  phone text,
  email text,
  address text,
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  logo_url text,
  primary_color text NOT NULL DEFAULT '#0f766e',
  ai_instructions text,
  emergency_message text NOT NULL DEFAULT 'If this is a medical emergency, please call 911 immediately. For mental health crisis support, call or text 988.',
  privacy_notice text NOT NULL DEFAULT 'For your privacy, please do not enter medical records, Social Security numbers, or other highly sensitive information into this chat unless specifically requested through a secure form.',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  email text,
  title text,
  phone text,
  avatar_url text,
  presence text NOT NULL DEFAULT 'offline',
  status public.entity_status NOT NULL DEFAULT 'active',
  max_concurrent_chats int NOT NULL DEFAULT 3,
  languages text[] NOT NULL DEFAULT ARRAY['English'],
  last_active_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Helper functions (security definer, bypass RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.role_rank(_role public.app_role)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _role
    WHEN 'agent' THEN 1 WHEN 'team_lead' THEN 2 WHEN 'manager' THEN 3
    WHEN 'administrator' THEN 4 WHEN 'super_admin' THEN 5 END;
$$;

CREATE OR REPLACE FUNCTION public.current_rank()
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(public.role_rank(role)), 0) FROM public.user_roles WHERE user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_access_org(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR (_org IS NOT NULL AND _org = public.current_org_id());
$$;

CREATE TABLE public.websites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  name text NOT NULL,
  domain text NOT NULL,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  status public.entity_status NOT NULL DEFAULT 'active',
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  -- branding / widget config
  widget_position text NOT NULL DEFAULT 'bottom-right',
  primary_color text NOT NULL DEFAULT '#0f766e',
  accent_color text NOT NULL DEFAULT '#0891b2',
  logo_url text,
  agent_avatar_url text,
  chatbot_name text NOT NULL DEFAULT 'Care Assistant',
  font_family text NOT NULL DEFAULT 'system-ui',
  widget_size text NOT NULL DEFAULT 'medium',
  border_radius int NOT NULL DEFAULT 16,
  welcome_message text NOT NULL DEFAULT 'Welcome! How can we help you today?',
  trigger_message text NOT NULL DEFAULT 'Hello! How can we help you today?',
  trigger_delay_seconds int NOT NULL DEFAULT 5,
  trigger_once_per_visit boolean NOT NULL DEFAULT true,
  trigger_repeat_days int NOT NULL DEFAULT 7,
  auto_open boolean NOT NULL DEFAULT false,
  hidden_paths text[] NOT NULL DEFAULT '{}',
  offline_message text NOT NULL DEFAULT 'Our live representatives are currently unavailable. You can leave a message, and a representative will follow up during normal business hours.',
  privacy_disclaimer text NOT NULL DEFAULT 'By continuing you agree to our privacy practices. Please do not share sensitive medical information in this chat.',
  consent_language text NOT NULL DEFAULT 'I consent to being contacted about my request.',
  ai_instructions text,
  menu_buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  routing_method text NOT NULL DEFAULT 'first_available',
  timezone text NOT NULL DEFAULT 'America/Los_Angeles',
  is_default boolean NOT NULL DEFAULT false,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.department_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, user_id)
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations, public.workspaces, public.websites, public.departments, public.department_members, public.profiles, public.user_roles TO authenticated;
GRANT ALL ON public.organizations, public.workspaces, public.websites, public.departments, public.department_members, public.profiles, public.user_roles TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select ON public.organizations FOR SELECT TO authenticated USING (public.can_access_org(id));
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated USING (public.can_access_org(id) AND public.current_rank() >= 4);
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());
CREATE POLICY org_delete ON public.organizations FOR DELETE TO authenticated USING (public.is_super_admin());

CREATE POLICY ws_select ON public.workspaces FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY ws_write ON public.workspaces FOR ALL TO authenticated
  USING (public.can_access_org(organization_id) AND public.current_rank() >= 4)
  WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 4);

CREATE POLICY web_select ON public.websites FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY web_write ON public.websites FOR ALL TO authenticated
  USING (public.can_access_org(organization_id) AND public.current_rank() >= 4)
  WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 4);

CREATE POLICY dept_select ON public.departments FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY dept_write ON public.departments FOR ALL TO authenticated
  USING (public.can_access_org(organization_id) AND public.current_rank() >= 3)
  WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY deptmem_select ON public.department_members FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY deptmem_write ON public.department_members FOR ALL TO authenticated
  USING (public.can_access_org(organization_id) AND public.current_rank() >= 3)
  WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY prof_select ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.can_access_org(organization_id));
CREATE POLICY prof_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY prof_admin_write ON public.profiles FOR ALL TO authenticated
  USING (public.can_access_org(organization_id) AND public.current_rank() >= 4)
  WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 4);

CREATE POLICY roles_select ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_access_org(organization_id));
CREATE POLICY roles_write ON public.user_roles FOR ALL TO authenticated
  USING (public.can_access_org(organization_id) AND public.current_rank() >= 4)
  WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 4);

CREATE TRIGGER t_org_upd BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_ws_upd BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_web_upd BEFORE UPDATE ON public.websites FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_dept_upd BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_prof_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
