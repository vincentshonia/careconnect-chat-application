-- 1. Data correction: "active" with nobody assigned is really "waiting".
UPDATE public.conversations
   SET status = 'waiting', claimed_at = NULL, updated_at = now()
 WHERE status = 'active' AND assigned_to IS NULL;

-- 2. Single lifecycle routine.
CREATE OR REPLACE FUNCTION public.transition_conversation(
  _id uuid,
  _event text,
  _actor uuid DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c            public.conversations%ROWTYPE;
  allowed      text[];
  now_ts       timestamptz := now();
  new_status   text;
  new_assignee uuid;
  disp         record;
  evt_type     text;
  evt_detail   text;
  detail_in    text := NULLIF(_payload->>'detail', '');
  to_human     boolean := COALESCE((_payload->>'to_human')::boolean, true);
  keep_assign  boolean := COALESCE((_payload->>'keep_assignee')::boolean, false);
  target_user  uuid := NULLIF(_payload->>'user_id', '')::uuid;
  dept         uuid := NULLIF(_payload->>'department_id', '')::uuid;
  expected     text := _payload->>'expected_assignee';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('claim_conv:' || _id::text, 0));
  SELECT * INTO c FROM public.conversations WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That conversation no longer exists.' USING ERRCODE = 'P0002';
  END IF;

  -- Allowed (event -> from_status) pairs. Anything else is refused.
  allowed := CASE _event
    WHEN 'handoff'  THEN ARRAY['new','waiting','assigned','active','follow_up','escalated','pending_visitor','pending_internal']
    WHEN 'claim'    THEN ARRAY['new','waiting','follow_up','escalated','pending_visitor','pending_internal']
    WHEN 'reply'    THEN ARRAY['assigned','active','follow_up','escalated','pending_visitor','pending_internal']
    WHEN 'transfer' THEN ARRAY['new','waiting','assigned','active','follow_up','escalated','pending_visitor','pending_internal']
    WHEN 'reassign' THEN ARRAY['new','waiting','assigned','active','follow_up','escalated','pending_visitor','pending_internal']
    WHEN 'release'  THEN ARRAY['assigned','active','follow_up','escalated','pending_visitor','pending_internal']
    WHEN 'resolve'  THEN ARRAY['new','waiting','assigned','active','follow_up','escalated','pending_visitor','pending_internal']
    WHEN 'close'    THEN ARRAY['new','waiting','assigned','active','follow_up','escalated','pending_visitor','pending_internal','resolved']
    WHEN 'reopen'   THEN ARRAY['resolved','closed','abandoned']
    WHEN 'abandon'  THEN ARRAY['new']
    ELSE NULL
  END;

  IF allowed IS NULL THEN
    RAISE EXCEPTION 'Unknown conversation event "%".', _event USING ERRCODE = 'P0001';
  END IF;

  IF NOT (c.status::text = ANY (allowed)) THEN
    RAISE EXCEPTION 'Cannot % a conversation that is %.', _event, c.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Ownership preconditions the status alone cannot express.
  IF _event IN ('reply','release') AND c.assigned_to IS NULL THEN
    RAISE EXCEPTION 'Cannot % a conversation that nobody is handling.', _event
      USING ERRCODE = 'P0001';
  END IF;
  IF _event = 'claim' AND c.assigned_to IS NOT NULL THEN
    RAISE EXCEPTION 'This conversation was just claimed by another team member.'
      USING ERRCODE = 'P0001';
  END IF;
  IF _event IN ('reassign','transfer','release')
     AND _payload ? 'expected_assignee'
     AND COALESCE(c.assigned_to::text, '') <> COALESCE(expected, '') THEN
    RAISE EXCEPTION 'This conversation was reassigned by someone else — reload and try again.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Marks this transaction as an authorised lifecycle write for the guard trigger.
  PERFORM set_config('app.lifecycle_write', 'on', true);

  IF _event = 'handoff' THEN
    IF c.assigned_to IS NOT NULL THEN
      -- Someone already owns it: never disturb their chat.
      RETURN jsonb_build_object('ok', true, 'changed', false,
        'status', c.status, 'assigned_to', c.assigned_to, 'previous_status', c.status);
    END IF;
    new_status := 'waiting';
    UPDATE public.conversations
       SET status = 'waiting',
           department_id = COALESCE(dept, department_id),
           is_ai_only = false,
           escalation_requested = true,
           escalation_reason = COALESCE(detail_in, escalation_reason),
           requested_agent_at = now_ts,
           first_human_requested_at = COALESCE(first_human_requested_at, now_ts),
           updated_at = now_ts
     WHERE id = _id;
    evt_type := COALESCE(NULLIF(_payload->>'event_type',''), 'escalation_requested');
    evt_detail := detail_in;

  ELSIF _event = 'claim' THEN
    new_status := 'assigned';
    new_assignee := COALESCE(target_user, _actor);
    IF new_assignee IS NULL THEN
      RAISE EXCEPTION 'A claim needs a team member.' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.conversations
       SET assigned_to = new_assignee, status = 'assigned', claimed_at = now_ts, updated_at = now_ts
     WHERE id = _id;
    evt_type := 'claimed';
    evt_detail := detail_in;

  ELSIF _event = 'reply' THEN
    new_status := 'active';
    new_assignee := c.assigned_to;
    UPDATE public.conversations
       SET status = 'active',
           last_message_at = now_ts,
           last_agent_message_at = now_ts,
           unread_agent_count = 0,
           first_response_at = COALESCE(first_response_at, now_ts),
           first_agent_response_at = COALESCE(first_agent_response_at, now_ts),
           updated_at = now_ts
     WHERE id = _id;
    -- The first agent reply is recorded as its own event for reporting.
    IF c.first_agent_response_at IS NULL THEN
      evt_type := 'agent_reply';
      evt_detail := detail_in;
    END IF;

  ELSIF _event IN ('transfer','release') OR (_event = 'reassign' AND target_user IS NULL) THEN
    new_status := 'waiting';
    UPDATE public.conversations
       SET assigned_to = NULL,
           status = 'waiting',
           claimed_at = NULL,
           department_id = COALESCE(dept, department_id),
           escalation_requested = true,
           transfer_count = transfer_count + CASE WHEN _event = 'transfer' THEN 1 ELSE 0 END,
           updated_at = now_ts
     WHERE id = _id;
    evt_type := CASE WHEN _event = 'transfer' THEN 'transferred' ELSE 'released' END;
    evt_detail := detail_in;

  ELSIF _event = 'reassign' THEN
    new_status := 'assigned';
    new_assignee := target_user;
    UPDATE public.conversations
       SET assigned_to = target_user, status = 'assigned', claimed_at = now_ts, updated_at = now_ts
     WHERE id = _id;
    evt_type := 'reassigned';
    evt_detail := detail_in;

  ELSIF _event = 'resolve' THEN
    IF NULLIF(_payload->>'disposition_id','') IS NULL THEN
      RAISE EXCEPTION 'Choose an outcome before resolving.' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO disp FROM public.conversation_dispositions
     WHERE id = (_payload->>'disposition_id')::uuid
       AND organization_id = c.organization_id
       AND is_active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Choose a valid outcome before resolving.' USING ERRCODE = 'P0001';
    END IF;
    new_status := 'resolved';
    new_assignee := c.assigned_to;
    UPDATE public.conversations
       SET status = 'resolved',
           resolved_at = now_ts,
           resolved_by = _actor,
           disposition_id = disp.id,
           updated_at = now_ts
     WHERE id = _id;
    evt_type := 'resolved';
    evt_detail := detail_in;

  ELSIF _event = 'close' THEN
    new_status := 'closed';
    new_assignee := c.assigned_to;
    UPDATE public.conversations
       SET status = 'closed', closed_at = now_ts, closed_by = _actor, updated_at = now_ts
     WHERE id = _id;
    evt_type := 'closed';
    evt_detail := detail_in;

  ELSIF _event = 'reopen' THEN
    new_status := CASE WHEN to_human THEN 'follow_up' ELSE 'new' END;
    new_assignee := CASE WHEN to_human AND keep_assign THEN c.assigned_to ELSE NULL END;
    UPDATE public.conversations
       SET status = new_status::conversation_status,
           assigned_to = new_assignee,
           claimed_at = CASE WHEN new_assignee IS NULL THEN NULL ELSE claimed_at END,
           escalation_requested = to_human,
           requested_agent_at = CASE WHEN to_human THEN now_ts ELSE requested_agent_at END,
           first_human_requested_at = CASE WHEN to_human THEN COALESCE(first_human_requested_at, now_ts)
                                           ELSE first_human_requested_at END,
           reopened_at = now_ts,
           reopened_count = reopened_count + 1,
           updated_at = now_ts
     WHERE id = _id;
    -- resolved_at / closed_at deliberately keep their original values.
    evt_type := CASE WHEN to_human THEN 'reopened' ELSE NULL END;
    evt_detail := detail_in;

  ELSIF _event = 'abandon' THEN
    IF c.escalation_requested THEN
      RAISE EXCEPTION 'Cannot abandon a conversation that asked for a person.' USING ERRCODE = 'P0001';
    END IF;
    new_status := 'abandoned';
    UPDATE public.conversations
       SET status = 'abandoned', closed_at = now_ts, updated_at = now_ts
     WHERE id = _id;
    evt_type := 'auto_abandoned';
    evt_detail := COALESCE(detail_in,
      'Closed automatically after 24 hours with no activity and no request for a person.');
  END IF;

  IF evt_type IS NOT NULL THEN
    INSERT INTO public.conversation_events
      (conversation_id, organization_id, actor_id, event_type, detail, previous_value, new_value)
    VALUES (_id, c.organization_id, _actor, evt_type, evt_detail, c.status::text,
            COALESCE(new_assignee::text, new_status));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'changed', true,
    'status', new_status,
    'assigned_to', new_assignee,
    'previous_status', c.status,
    'previous_assignee', c.assigned_to,
    'organization_id', c.organization_id,
    'website_id', c.website_id,
    'department_id', COALESCE(dept, c.department_id),
    'reference', c.reference,
    'first_agent_reply', (_event = 'reply' AND c.first_agent_response_at IS NULL)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.transition_conversation(uuid, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_conversation(uuid, text, uuid, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_conversation(uuid, text, uuid, jsonb) TO service_role;

-- 3. claim_conversation keeps its eligibility checks, delegates the write.
CREATE OR REPLACE FUNCTION public.claim_conversation(_conversation uuid, _user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c record;
  m record;
  p record;
  live_count int;
  cap int;
  prev_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('claim_user:' || _user::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('claim_conv:' || _conversation::text, 0));

  SELECT * INTO c FROM public.conversations WHERE id = _conversation FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'That conversation no longer exists.');
  END IF;

  SELECT * INTO m FROM public.organization_memberships
   WHERE user_id = _user AND organization_id = c.organization_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_membership', 'message', 'You are not a member of this organization.');
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = _user;
  IF NOT FOUND OR p.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'inactive_profile', 'message', 'Your account is not active.');
  END IF;

  IF COALESCE(p.presence, 'offline') <> 'available' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unavailable',
      'message', 'Set your status to Available before claiming a conversation.');
  END IF;

  IF c.department_id IS NOT NULL
     AND public.org_role_rank(c.organization_id, _user) < 2
     AND NOT EXISTS (
       SELECT 1 FROM public.department_members dm
        WHERE dm.department_id = c.department_id AND dm.user_id = _user
     ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'wrong_department',
      'message', 'This conversation is not in one of your departments.');
  END IF;

  IF c.assigned_to IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_claimed',
      'message', 'This conversation was just claimed by another team member.');
  END IF;

  IF NOT (c.status::text = ANY (ARRAY['new','waiting','follow_up','escalated','pending_visitor','pending_internal'])) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_claimable',
      'message', 'This conversation is no longer waiting for someone to pick it up.');
  END IF;

  cap := COALESCE(p.max_concurrent_chats, 0);
  IF cap > 0 THEN
    SELECT count(*) INTO live_count FROM public.conversations
     WHERE assigned_to = _user AND status = ANY (public.busy_conversation_statuses());
    IF live_count >= cap THEN
      RETURN jsonb_build_object('ok', false, 'code', 'at_capacity',
        'message', 'You have reached your maximum number of active conversations.');
    END IF;
  END IF;

  prev_status := c.status::text;
  PERFORM public.transition_conversation(
    _conversation, 'claim', _user,
    jsonb_build_object('user_id', _user, 'suppress_event', true)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'assigned_to', _user,
    'assigned_name', COALESCE(p.full_name, 'A team member'),
    'organization_id', c.organization_id,
    'website_id', c.website_id,
    'department_id', c.department_id,
    'reference', c.reference,
    'previous_status', prev_status
  );
END;
$function$;

-- 4. Nothing outside the routine may write lifecycle columns.
CREATE OR REPLACE FUNCTION public.guard_conversation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.lifecycle_write', true) = 'on'
     OR COALESCE(auth.role(), current_user) IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
     OR NEW.requested_agent_at IS DISTINCT FROM OLD.requested_agent_at
     OR NEW.first_response_at IS DISTINCT FROM OLD.first_response_at
     OR NEW.first_agent_response_at IS DISTINCT FROM OLD.first_agent_response_at
     OR NEW.first_human_requested_at IS DISTINCT FROM OLD.first_human_requested_at
     OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at
     OR NEW.resolved_by IS DISTINCT FROM OLD.resolved_by
     OR NEW.closed_at IS DISTINCT FROM OLD.closed_at
     OR NEW.closed_by IS DISTINCT FROM OLD.closed_by
     OR NEW.reopened_at IS DISTINCT FROM OLD.reopened_at
     OR NEW.reopened_count IS DISTINCT FROM OLD.reopened_count
     OR NEW.transfer_count IS DISTINCT FROM OLD.transfer_count
     OR NEW.escalation_requested IS DISTINCT FROM OLD.escalation_requested THEN
    RAISE EXCEPTION 'Conversation status and ownership can only be changed through the lifecycle workflow.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_conversation_lifecycle ON public.conversations;
CREATE TRIGGER guard_conversation_lifecycle
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_lifecycle();

-- 5. Permanent consistency rule.
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_status_assignee_consistent;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_status_assignee_consistent CHECK (
    (status NOT IN ('active','assigned','waiting','new'))
    OR (status IN ('active','assigned') AND assigned_to IS NOT NULL)
    OR (status IN ('waiting','new') AND assigned_to IS NULL)
  ) NOT VALID;
ALTER TABLE public.conversations VALIDATE CONSTRAINT conversations_status_assignee_consistent;