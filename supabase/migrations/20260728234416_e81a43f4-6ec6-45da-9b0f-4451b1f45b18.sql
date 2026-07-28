CREATE TYPE public.intake_type AS ENUM ('referral','enrollment','general','callback');
CREATE TYPE public.intake_stage AS ENUM ('new','in_review','contacted','eligibility_check','submitted','approved','denied','withdrawn');

CREATE TABLE public.intake_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  website_id uuid REFERENCES public.websites(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  assigned_to uuid,
  reference text NOT NULL DEFAULT ('INT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  request_type public.intake_type NOT NULL DEFAULT 'referral',
  stage public.intake_stage NOT NULL DEFAULT 'new',
  priority public.conversation_priority NOT NULL DEFAULT 'normal',
  full_name text NOT NULL,
  email text,
  phone text,
  county text,
  zip_code text,
  health_plan text,
  service_interest text,
  preferred_language text,
  preferred_contact_method text,
  source text NOT NULL DEFAULT 'widget',
  notes text,
  due_date date,
  submitted_at timestamptz,
  closed_at timestamptz,
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.intake_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES public.intake_requests(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  event_type text NOT NULL,
  detail text,
  previous_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intake_requests TO authenticated;
GRANT ALL ON public.intake_requests TO service_role;
GRANT SELECT, INSERT ON public.intake_events TO authenticated;
GRANT ALL ON public.intake_events TO service_role;

ALTER TABLE public.intake_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org staff manage intakes" ON public.intake_requests
  FOR ALL TO authenticated
  USING (public.can_access_org(organization_id))
  WITH CHECK (public.can_access_org(organization_id));

CREATE POLICY "org staff read intake events" ON public.intake_events
  FOR SELECT TO authenticated
  USING (public.can_access_org(organization_id));

CREATE POLICY "org staff add intake events" ON public.intake_events
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_org(organization_id));

CREATE INDEX idx_intake_org_stage ON public.intake_requests (organization_id, stage);
CREATE INDEX idx_intake_created ON public.intake_requests (created_at DESC);
CREATE INDEX idx_intake_events_intake ON public.intake_events (intake_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_intake_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at = now();
    IF NEW.stage IN ('approved','denied','withdrawn') THEN NEW.closed_at = now(); END IF;
    IF NEW.stage = 'submitted' AND NEW.submitted_at IS NULL THEN NEW.submitted_at = now(); END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_intake_touch BEFORE UPDATE ON public.intake_requests
FOR EACH ROW EXECUTE FUNCTION public.touch_intake_stage();