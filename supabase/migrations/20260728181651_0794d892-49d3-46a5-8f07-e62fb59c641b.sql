
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE public.kb_status AS ENUM ('draft','pending_review','approved','published','archived','expired');
CREATE TYPE public.conversation_status AS ENUM ('new','waiting','assigned','active','pending_visitor','pending_internal','follow_up','escalated','resolved','closed','spam','archived');
CREATE TYPE public.conversation_priority AS ENUM ('low','normal','high','urgent');

CREATE TABLE public.knowledge_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.knowledge_categories(id) ON DELETE SET NULL,
  website_ids uuid[] NOT NULL DEFAULT '{}',
  applies_to_all boolean NOT NULL DEFAULT true,
  title text NOT NULL,
  content text NOT NULL,
  summary text,
  source_url text,
  tags text[] NOT NULL DEFAULT '{}',
  status public.kb_status NOT NULL DEFAULT 'draft',
  version int NOT NULL DEFAULT 1,
  effective_date date,
  review_date date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.knowledge_articles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  chunk_index int NOT NULL DEFAULT 0,
  content text NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_chunks_embedding_idx ON public.knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX knowledge_chunks_article_idx ON public.knowledge_chunks(article_id);

CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_ids uuid[] NOT NULL DEFAULT '{}',
  applies_to_all boolean NOT NULL DEFAULT true,
  name text NOT NULL,
  short_description text NOT NULL DEFAULT '',
  eligibility_overview text,
  counties text[] NOT NULL DEFAULT '{}',
  health_plans text[] NOT NULL DEFAULT '{}',
  learn_more_url text,
  sort_order int NOT NULL DEFAULT 0,
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_ids uuid[] NOT NULL DEFAULT '{}',
  applies_to_all boolean NOT NULL DEFAULT true,
  category text NOT NULL DEFAULT 'General Questions',
  question text NOT NULL,
  answer text NOT NULL,
  helpful_count int NOT NULL DEFAULT 0,
  not_helpful_count int NOT NULL DEFAULT 0,
  view_count int NOT NULL DEFAULT 0,
  status public.entity_status NOT NULL DEFAULT 'active',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.visitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  session_token text NOT NULL UNIQUE,
  landing_page text,
  current_page text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device_type text,
  browser text,
  region text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text,
  email text,
  preferred_language text DEFAULT 'English',
  preferred_contact_method text,
  county text,
  zip_code text,
  health_plan text,
  service_interest text,
  visitor_type text DEFAULT 'prospect',
  lead_status text NOT NULL DEFAULT 'new',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tags text[] NOT NULL DEFAULT '{}',
  consent_given boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  notes text,
  first_contact_at timestamptz NOT NULL DEFAULT now(),
  last_contact_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_email_idx ON public.contacts(organization_id, lower(email));
CREATE INDEX contacts_phone_idx ON public.contacts(organization_id, phone);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  website_id uuid NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  visitor_id uuid REFERENCES public.visitors(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reference text NOT NULL DEFAULT ('C-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  subject text,
  status public.conversation_status NOT NULL DEFAULT 'new',
  priority public.conversation_priority NOT NULL DEFAULT 'normal',
  channel text NOT NULL DEFAULT 'widget',
  visitor_type text NOT NULL DEFAULT 'anonymous_visitor',
  outcome text,
  is_ai_only boolean NOT NULL DEFAULT true,
  escalation_requested boolean NOT NULL DEFAULT false,
  escalation_reason text,
  tags text[] NOT NULL DEFAULT '{}',
  requested_agent_at timestamptz,
  first_response_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  unread_agent_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_org_idx ON public.conversations(organization_id, status, last_message_at DESC);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid NOT NULL REFERENCES public.websites(id) ON DELETE CASCADE,
  sender_type text NOT NULL,
  sender_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_name text,
  body text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at);

CREATE TABLE public.internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.conversation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  detail text,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric,
  model text,
  escalated boolean NOT NULL DEFAULT false,
  visitor_feedback text,
  agent_flag text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.business_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.websites(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  day_of_week int NOT NULL,
  open_time time NOT NULL DEFAULT '09:00',
  close_time time NOT NULL DEFAULT '17:00',
  is_closed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.websites(id) ON DELETE CASCADE,
  name text NOT NULL,
  holiday_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.websites(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  match_type text NOT NULL DEFAULT 'menu_option',
  match_value text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  routing_method text NOT NULL DEFAULT 'first_available',
  status public.entity_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.response_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.websites(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text,
  language text NOT NULL DEFAULT 'English',
  shortcut text,
  body text NOT NULL,
  approved boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  action text NOT NULL,
  record_type text,
  record_id uuid,
  previous_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_idx ON public.audit_logs(organization_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_categories, public.knowledge_articles, public.knowledge_chunks, public.services, public.faqs, public.visitors, public.contacts, public.conversations, public.messages, public.internal_notes, public.conversation_events, public.ai_responses, public.business_hours, public.holidays, public.routing_rules, public.response_templates TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.knowledge_categories, public.knowledge_articles, public.knowledge_chunks, public.services, public.faqs, public.visitors, public.contacts, public.conversations, public.messages, public.internal_notes, public.conversation_events, public.ai_responses, public.business_hours, public.holidays, public.routing_rules, public.response_templates, public.audit_logs TO service_role;

ALTER TABLE public.knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY kbc_select ON public.knowledge_categories FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY kbc_write ON public.knowledge_categories FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY kba_select ON public.knowledge_articles FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY kba_write ON public.knowledge_articles FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY kbch_select ON public.knowledge_chunks FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY kbch_write ON public.knowledge_chunks FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY svc_select ON public.services FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY svc_write ON public.services FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY faq_select ON public.faqs FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY faq_write ON public.faqs FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY vis_select ON public.visitors FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY vis_write ON public.visitors FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY cont_select ON public.contacts FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY cont_write ON public.contacts FOR ALL TO authenticated USING (public.can_access_org(organization_id)) WITH CHECK (public.can_access_org(organization_id));

CREATE POLICY conv_select ON public.conversations FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY conv_write ON public.conversations FOR ALL TO authenticated USING (public.can_access_org(organization_id)) WITH CHECK (public.can_access_org(organization_id));

CREATE POLICY msg_select ON public.messages FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY msg_write ON public.messages FOR ALL TO authenticated USING (public.can_access_org(organization_id)) WITH CHECK (public.can_access_org(organization_id));

CREATE POLICY note_select ON public.internal_notes FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY note_write ON public.internal_notes FOR ALL TO authenticated USING (public.can_access_org(organization_id)) WITH CHECK (public.can_access_org(organization_id));

CREATE POLICY cev_select ON public.conversation_events FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY cev_insert ON public.conversation_events FOR INSERT TO authenticated WITH CHECK (public.can_access_org(organization_id));

CREATE POLICY air_select ON public.ai_responses FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY air_write ON public.ai_responses FOR ALL TO authenticated USING (public.can_access_org(organization_id)) WITH CHECK (public.can_access_org(organization_id));

CREATE POLICY bh_select ON public.business_hours FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY bh_write ON public.business_hours FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY hol_select ON public.holidays FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY hol_write ON public.holidays FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY rr_select ON public.routing_rules FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY rr_write ON public.routing_rules FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY tpl_select ON public.response_templates FOR SELECT TO authenticated USING (public.can_access_org(organization_id));
CREATE POLICY tpl_write ON public.response_templates FOR ALL TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3) WITH CHECK (public.can_access_org(organization_id) AND public.current_rank() >= 3);

CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated USING (public.can_access_org(organization_id) AND public.current_rank() >= 3);
CREATE POLICY audit_insert ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.can_access_org(organization_id));

CREATE TRIGGER t_kba_upd BEFORE UPDATE ON public.knowledge_articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_svc_upd BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_faq_upd BEFORE UPDATE ON public.faqs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_cont_upd BEFORE UPDATE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_conv_upd BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_rr_upd BEFORE UPDATE ON public.routing_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_tpl_upd BEFORE UPDATE ON public.response_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
