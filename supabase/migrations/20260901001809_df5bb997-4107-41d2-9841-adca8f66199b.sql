-- 1. Attribution + denormalised reporting columns
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transfer_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_human_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_visitor_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_agent_message_at timestamptz;

-- 2. Maintain transfer count from the authoritative event stream
CREATE OR REPLACE FUNCTION public.track_conversation_event_counters()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type = 'transferred' THEN
    UPDATE public.conversations
      SET transfer_count = COALESCE(transfer_count, 0) + 1
      WHERE id = NEW.conversation_id;
  ELSIF NEW.event_type = 'reopened' THEN
    UPDATE public.conversations
      SET reopened_count = COALESCE(reopened_count, 0) + 1
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversation_event_counters ON public.conversation_events;
CREATE TRIGGER trg_conversation_event_counters
AFTER INSERT ON public.conversation_events
FOR EACH ROW EXECUTE FUNCTION public.track_conversation_event_counters();

-- 3. Maintain last visitor / agent message timestamps
CREATE OR REPLACE FUNCTION public.track_message_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_type = 'visitor' THEN
    UPDATE public.conversations SET last_visitor_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  ELSIF NEW.sender_type = 'agent' THEN
    UPDATE public.conversations SET last_agent_message_at = NEW.created_at WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_message_activity ON public.messages;
CREATE TRIGGER trg_message_activity
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.track_message_activity();

-- 4. Reporting indexes
CREATE INDEX IF NOT EXISTS idx_conv_org_created ON public.conversations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_org_status ON public.conversations (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_conv_org_dept_status ON public.conversations (organization_id, department_id, status);
CREATE INDEX IF NOT EXISTS idx_conv_org_assigned_status ON public.conversations (organization_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_conv_org_closed ON public.conversations (organization_id, closed_at);
CREATE INDEX IF NOT EXISTS idx_conv_org_resolved ON public.conversations (organization_id, resolved_at);
CREATE INDEX IF NOT EXISTS idx_conv_org_website ON public.conversations (organization_id, website_id);
CREATE INDEX IF NOT EXISTS idx_conv_escalation ON public.conversations (organization_id, escalation_requested);

CREATE INDEX IF NOT EXISTS idx_cev_org_type_created ON public.conversation_events (organization_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cev_conv_type ON public.conversation_events (conversation_id, event_type);
CREATE INDEX IF NOT EXISTS idx_cev_actor_type_created ON public.conversation_events (actor_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_msg_conv_sender_created ON public.messages (conversation_id, sender_type, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_org_sender_user ON public.messages (organization_id, sender_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intake_org_stage_created ON public.intake_requests (organization_id, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_org_dept ON public.intake_requests (organization_id, department_id);

CREATE INDEX IF NOT EXISTS idx_ai_org_created ON public.ai_responses (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_conv ON public.conversation_ratings (conversation_id);

-- 5. Reconstruct what history allows (attribution that was never captured stays NULL)
UPDATE public.conversations c
   SET transfer_count = e.n
  FROM (SELECT conversation_id, count(*)::int AS n
          FROM public.conversation_events
         WHERE event_type = 'transferred'
         GROUP BY conversation_id) e
 WHERE e.conversation_id = c.id AND COALESCE(c.transfer_count, 0) <> e.n;

UPDATE public.conversations
   SET resolved_at = closed_at
 WHERE status = 'resolved' AND resolved_at IS NULL AND closed_at IS NOT NULL;

UPDATE public.conversations c
   SET last_visitor_message_at = m.last_visitor,
       last_agent_message_at = m.last_agent
  FROM (SELECT conversation_id,
               max(created_at) FILTER (WHERE sender_type = 'visitor') AS last_visitor,
               max(created_at) FILTER (WHERE sender_type = 'agent') AS last_agent
          FROM public.messages GROUP BY conversation_id) m
 WHERE m.conversation_id = c.id
   AND (c.last_visitor_message_at IS NULL OR c.last_agent_message_at IS NULL);

UPDATE public.conversations
   SET first_human_requested_at = requested_agent_at
 WHERE first_human_requested_at IS NULL AND requested_agent_at IS NOT NULL;