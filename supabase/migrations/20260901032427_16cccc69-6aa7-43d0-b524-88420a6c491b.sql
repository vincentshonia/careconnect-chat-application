-- Atomic claim: serialise by BOTH the claiming user and the conversation,
-- and require presence = 'available'.
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
  -- Per-user lock FIRST (stable ordering: user then conversation) so a single
  -- agent cannot exceed capacity by claiming several conversations at once.
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

  IF c.status IN ('closed','resolved','archived','spam') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'closed', 'message', 'This conversation is already closed.');
  END IF;

  IF c.assigned_to IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_claimed',
      'message', 'This conversation was just claimed by '
        || COALESCE((SELECT full_name FROM public.profiles WHERE id = c.assigned_to), 'another team member') || '.');
  END IF;

  IF NOT (c.status = ANY (public.claimable_conversation_statuses())) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_claimable',
      'message', 'This conversation cannot be claimed right now.');
  END IF;

  cap := COALESCE(p.max_concurrent_chats, 0);
  IF cap > 0 THEN
    SELECT count(*) INTO live_count FROM public.conversations
     WHERE assigned_to = _user
       AND status = ANY (public.busy_conversation_statuses());
    IF live_count >= cap THEN
      RETURN jsonb_build_object('ok', false, 'code', 'at_capacity',
        'message', 'You have reached your maximum number of active conversations.');
    END IF;
  END IF;

  UPDATE public.conversations
     SET assigned_to = _user,
         status = 'assigned',
         claimed_at = now(),
         updated_at = now()
   WHERE id = _conversation AND assigned_to IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_claimed',
      'message', 'This conversation was just claimed by another team member.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'assigned_to', _user,
    'assigned_name', COALESCE(p.full_name, 'A team member'),
    'organization_id', c.organization_id,
    'website_id', c.website_id,
    'department_id', c.department_id,
    'reference', c.reference,
    'previous_status', c.status
  );
END;
$$;

-- Ordered candidate list (not just the single best) so routing can fall through.
CREATE OR REPLACE FUNCTION public.round_robin_candidates(_department uuid)
RETURNS TABLE (user_id uuid, full_name text, membership_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dm.user_id, p.full_name, dm.id
  FROM public.department_members dm
  JOIN public.profiles p ON p.id = dm.user_id
  JOIN public.organization_memberships om
    ON om.user_id = dm.user_id
   AND om.organization_id = dm.organization_id
   AND om.status = 'active'
  LEFT JOIN LATERAL (
    SELECT count(*) AS load
    FROM public.conversations c
    WHERE c.assigned_to = dm.user_id
      AND c.status = ANY (public.busy_conversation_statuses())
  ) l ON true
  WHERE dm.department_id = _department
    AND p.status = 'active'
    AND p.presence = 'available'
    AND (COALESCE(p.max_concurrent_chats, 0) <= 0 OR l.load < p.max_concurrent_chats)
  ORDER BY dm.last_assigned_at ASC NULLS FIRST, dm.created_at ASC
  LIMIT 25
$$;

-- Round-robin with per-agent locking and post-lock re-verification.
CREATE OR REPLACE FUNCTION public.assign_round_robin(_conversation uuid, _department uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cand   record;
  conv   public.conversations%ROWTYPE;
  ok_cand boolean;
  load   int;
  cap    int;
BEGIN
  IF _department IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_department');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('claim_conv:' || _conversation::text, 0));

  SELECT * INTO conv FROM public.conversations WHERE id = _conversation FOR UPDATE;
  IF conv.id IS NULL OR conv.assigned_to IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unavailable');
  END IF;

  FOR cand IN SELECT * FROM public.round_robin_candidates(_department) LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('claim_user:' || cand.user_id::text, 0));

    -- Re-verify everything now that we hold the agent's lock.
    SELECT
      p.status = 'active'
      AND COALESCE(p.presence, 'offline') = 'available'
      AND om.status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.department_members dm
        WHERE dm.user_id = cand.user_id AND dm.department_id = _department
      ),
      COALESCE(p.max_concurrent_chats, 0)
    INTO ok_cand, cap
    FROM public.profiles p
    JOIN public.organization_memberships om
      ON om.user_id = p.id AND om.organization_id = conv.organization_id
    WHERE p.id = cand.user_id
    LIMIT 1;

    IF NOT COALESCE(ok_cand, false) THEN
      CONTINUE;
    END IF;

    IF cap > 0 THEN
      SELECT count(*) INTO load FROM public.conversations c
       WHERE c.assigned_to = cand.user_id
         AND c.status = ANY (public.busy_conversation_statuses());
      IF load >= cap THEN
        CONTINUE;
      END IF;
    END IF;

    UPDATE public.conversations
       SET assigned_to = cand.user_id, status = 'assigned', claimed_at = now(), updated_at = now()
     WHERE id = _conversation AND assigned_to IS NULL;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'unavailable');
    END IF;

    UPDATE public.department_members SET last_assigned_at = now() WHERE id = cand.membership_id;

    RETURN jsonb_build_object('ok', true, 'user_id', cand.user_id,
      'full_name', COALESCE(cand.full_name, 'Agent'));
  END LOOP;

  RETURN jsonb_build_object('ok', false, 'code', 'no_agent');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_conversation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_round_robin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.round_robin_candidates(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_round_robin(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.round_robin_candidates(uuid) TO service_role;