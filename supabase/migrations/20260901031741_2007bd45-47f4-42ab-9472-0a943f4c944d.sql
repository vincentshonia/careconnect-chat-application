CREATE OR REPLACE FUNCTION public.claim_conversation(_conversation uuid, _user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c record;
  m record;
  p record;
  live_count int;
  cap int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_conversation::text, 0));

  SELECT * INTO c FROM public.conversations WHERE id = _conversation FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'That conversation no longer exists.');
  END IF;

  SELECT * INTO m FROM public.organization_memberships
   WHERE user_id = _user AND organization_id = c.organization_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'You are not a member of this organization.');
  END IF;

  SELECT * INTO p FROM public.profiles WHERE id = _user;
  IF NOT FOUND OR p.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Your account is not active.');
  END IF;

  IF c.department_id IS NOT NULL
     AND public.org_role_rank(c.organization_id, _user) < 2
     AND NOT EXISTS (
       SELECT 1 FROM public.department_members dm
        WHERE dm.department_id = c.department_id AND dm.user_id = _user
     ) THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This conversation is not in one of your departments.');
  END IF;

  IF c.status IN ('closed','resolved','archived','spam') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This conversation is already closed.');
  END IF;

  IF c.assigned_to IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'message', 'This conversation was just claimed by '
        || COALESCE((SELECT full_name FROM public.profiles WHERE id = c.assigned_to), 'another team member') || '.'
    );
  END IF;

  IF c.status NOT IN ('new','waiting','escalated','follow_up') THEN
    RETURN jsonb_build_object('ok', false, 'message', 'This conversation cannot be claimed right now.');
  END IF;

  cap := COALESCE(p.max_concurrent_chats, 0);
  IF cap > 0 THEN
    SELECT count(*) INTO live_count FROM public.conversations
     WHERE assigned_to = _user
       AND status IN ('assigned','active','pending_visitor','pending_internal','escalated','follow_up');
    IF live_count >= cap THEN
      RETURN jsonb_build_object('ok', false, 'message', 'You have reached your maximum number of active conversations.');
    END IF;
  END IF;

  UPDATE public.conversations
     SET assigned_to = _user,
         status = 'assigned',
         claimed_at = now(),
         updated_at = now()
   WHERE id = _conversation;

  RETURN jsonb_build_object(
    'ok', true,
    'assigned_name', COALESCE(p.full_name, 'A team member'),
    'organization_id', c.organization_id,
    'website_id', c.website_id,
    'department_id', c.department_id,
    'reference', c.reference,
    'previous_status', c.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_conversation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation(uuid, uuid) TO service_role;