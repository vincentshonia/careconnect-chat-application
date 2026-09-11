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

  IF NOT (c.status::text = ANY (public.claimable_conversation_statuses()::text[])) THEN
    -- The refusal reason is the conversation's own state, as before.
    RETURN jsonb_build_object('ok', false, 'code', c.status::text,
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
    _conversation, 'claim', _user, jsonb_build_object('user_id', _user)
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