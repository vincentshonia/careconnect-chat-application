ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS sla_first_response_minutes integer NOT NULL DEFAULT 15;

CREATE INDEX IF NOT EXISTS notifications_record_id_type_idx
  ON public.notifications (record_id, type);