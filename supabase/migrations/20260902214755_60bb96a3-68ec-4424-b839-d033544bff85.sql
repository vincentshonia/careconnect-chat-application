CREATE INDEX IF NOT EXISTS conversations_unassigned_queue_idx
  ON public.conversations (status, last_message_at DESC)
  WHERE assigned_to IS NULL;

CREATE INDEX IF NOT EXISTS conversations_org_status_last_message_idx
  ON public.conversations (organization_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS conversations_assigned_to_idx
  ON public.conversations (assigned_to, last_message_at DESC);