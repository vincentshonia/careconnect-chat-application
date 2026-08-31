-- ============ platform admin layer ============
DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM ('platform_owner','platform_admin','platform_support','platform_billing','platform_read_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.platform_role NOT NULL DEFAULT 'platform_read_only',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = _user);
$$;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM anon;

DROP POLICY IF EXISTS "Platform staff read platform admins" ON public.platform_admins;
CREATE POLICY "Platform staff read platform admins" ON public.platform_admins
  FOR SELECT TO authenticated USING (public.is_platform_admin());

-- ============ membership ============
DO $$ BEGIN
  CREATE TYPE public.membership_status AS ENUM ('invited','active','suspended','removed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  status public.membership_status NOT NULL DEFAULT 'active',
  title text,
  invited_by uuid,
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_org_memberships_user ON public.organization_memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_org_memberships_org ON public.organization_memberships(organization_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_memberships TO authenticated;
GRANT ALL ON public.organization_memberships TO service_role;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- Backfill from existing profiles + roles so nobody loses access.
INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
SELECT p.organization_id, p.id,
       COALESCE((
         SELECT ur.role FROM public.user_roles ur
         WHERE ur.user_id = p.id
         ORDER BY CASE ur.role
           WHEN 'super_admin' THEN 5 WHEN 'administrator' THEN 4 WHEN 'manager' THEN 3
           WHEN 'team_lead' THEN 2 ELSE 1 END DESC
         LIMIT 1), 'agent'::public.app_role),
       CASE WHEN p.status = 'active' THEN 'active' ELSE 'suspended' END::public.membership_status,
       p.created_at
FROM public.profiles p
WHERE p.organization_id IS NOT NULL
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Existing super admins become platform owners (global access moves here).
INSERT INTO public.platform_admins (user_id, role)
SELECT DISTINCT ur.user_id, 'platform_owner'::public.platform_role
FROM public.user_roles ur WHERE ur.role = 'super_admin'
ON CONFLICT (user_id) DO NOTHING;

-- ============ access helpers ============
CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _org IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.user_id = _user AND m.organization_id = _org AND m.status = 'active');
$$;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.org_role_rank(_org uuid, _user uuid DEFAULT auth.uid())
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE m.role
      WHEN 'super_admin' THEN 5 WHEN 'administrator' THEN 4 WHEN 'manager' THEN 3
      WHEN 'team_lead' THEN 2 ELSE 1 END
    FROM public.organization_memberships m
    WHERE m.user_id = _user AND m.organization_id = _org AND m.status = 'active'), 0);
$$;
REVOKE EXECUTE ON FUNCTION public.org_role_rank(uuid, uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.is_org_admin(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin() OR public.org_role_rank(_org) >= 4;
$$;
REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid) FROM anon;

CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.organization_id FROM public.organization_memberships m
  WHERE m.user_id = auth.uid() AND m.status = 'active'
  ORDER BY m.created_at LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_access_org(_org uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin() OR public.is_org_member(_org);
$$;

DROP POLICY IF EXISTS "Members read memberships in their org" ON public.organization_memberships;
CREATE POLICY "Members read memberships in their org" ON public.organization_memberships
  FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
DROP POLICY IF EXISTS "Org admins manage memberships" ON public.organization_memberships;
CREATE POLICY "Org admins manage memberships" ON public.organization_memberships
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- Keep profiles.organization_id in sync with the primary active membership.
CREATE OR REPLACE FUNCTION public.sync_profile_org() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active' THEN
    UPDATE public.profiles SET organization_id = NEW.organization_id
    WHERE id = NEW.user_id AND organization_id IS DISTINCT FROM NEW.organization_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_sync_profile_org ON public.organization_memberships;
CREATE TRIGGER trg_sync_profile_org AFTER INSERT OR UPDATE ON public.organization_memberships
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_org();

-- ============ no implicit tenant on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Deliberately assigns NO organization and NO role. Access is granted
  -- only by accepting an invitation (see organization_invitations).
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

-- ============ invitations ============
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'agent',
  department_ids uuid[] NOT NULL DEFAULT '{}',
  title text,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  invited_by uuid,
  accepted_user_id uuid,
  accepted_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON public.organization_invitations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.organization_invitations(lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins manage invitations" ON public.organization_invitations;
CREATE POLICY "Org admins manage invitations" ON public.organization_invitations
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- ============ widget keys + domain verification ============
ALTER TABLE public.websites
  ADD COLUMN IF NOT EXISTS public_key text,
  ADD COLUMN IF NOT EXISTS verification_token text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS dev_mode boolean NOT NULL DEFAULT true;

UPDATE public.websites
SET public_key = COALESCE(public_key, 'cc_pk_' || replace(gen_random_uuid()::text, '-', '')),
    verification_token = COALESCE(verification_token, 'careconnect-verify-' || replace(gen_random_uuid()::text, '-', ''));

ALTER TABLE public.websites ALTER COLUMN public_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_websites_public_key ON public.websites(public_key);

-- ============ usage + spend controls ============
CREATE TABLE IF NOT EXISTS public.organization_limits (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  monthly_ai_messages integer NOT NULL DEFAULT 5000,
  monthly_ai_tokens bigint NOT NULL DEFAULT 5000000,
  session_ai_messages_per_minute integer NOT NULL DEFAULT 15,
  ip_requests_per_minute integer NOT NULL DEFAULT 60,
  max_prompt_chars integer NOT NULL DEFAULT 2000,
  hard_stop boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organization_limits TO authenticated;
GRANT ALL ON public.organization_limits TO service_role;
ALTER TABLE public.organization_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read their org limits" ON public.organization_limits;
CREATE POLICY "Members read their org limits" ON public.organization_limits
  FOR SELECT TO authenticated USING (public.can_access_org(organization_id));

INSERT INTO public.organization_limits (organization_id)
SELECT id FROM public.organizations ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.usage_counters (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period text NOT NULL,
  metric text NOT NULL,
  value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, period, metric)
);
GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Members read their org usage" ON public.usage_counters;
CREATE POLICY "Members read their org usage" ON public.usage_counters
  FOR SELECT TO authenticated USING (public.can_access_org(organization_id));

CREATE OR REPLACE FUNCTION public.bump_usage(_org uuid, _metric text, _amount bigint DEFAULT 1)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v bigint; p text := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM');
BEGIN
  INSERT INTO public.usage_counters (organization_id, period, metric, value)
  VALUES (_org, p, _metric, _amount)
  ON CONFLICT (organization_id, period, metric)
  DO UPDATE SET value = public.usage_counters.value + _amount, updated_at = now()
  RETURNING value INTO v;
  RETURN v;
END $$;
REVOKE EXECUTE ON FUNCTION public.bump_usage(uuid, text, bigint) FROM anon, authenticated;