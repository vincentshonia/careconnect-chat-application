CREATE TABLE public.alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  department_name text,
  channel text NOT NULL DEFAULT 'ringcentral',
  chat_id text,
  identity text,
  status_code integer,
  ok boolean NOT NULL DEFAULT false,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.alert_deliveries TO authenticated;
GRANT ALL ON public.alert_deliveries TO service_role;

ALTER TABLE public.alert_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org admins read alert deliveries"
  ON public.alert_deliveries FOR SELECT TO authenticated
  USING (private.is_org_member(organization_id, auth.uid()));

CREATE INDEX alert_deliveries_org_created_idx
  ON public.alert_deliveries (organization_id, created_at DESC);