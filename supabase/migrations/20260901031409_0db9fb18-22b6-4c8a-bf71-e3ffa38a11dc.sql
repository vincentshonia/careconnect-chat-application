-- ============================================================
-- Scale + concurrency hardening: atomic claim, SQL routing,
-- eligible notification recipients, supporting indexes.
-- Non-destructive: no data is modified.
-- ============================================================

-- ---------- Indexes for queue / routing / notification paths ----------
CREATE INDEX IF NOT EXISTS idx_conversations_org_status_last_msg
  ON public.conversations (organization_id, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_org_dept_status
  ON public.conversations (organization_id, department_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_status
  ON public.conversations (assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_unassigned_queue
  ON public.conversations (organization_id, department_id, last_message_at DESC)
  WHERE assigned_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_org_created
  ON public.conversations (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_org_resolved
  ON public.conversations (organization_id, resolved_at DESC) WHERE resolved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_resolved_by
  ON public.conversations (resolved_by) WHERE resolved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_website
  ON public.conversations (website_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_visitor
  ON public.conversations (visitor_id) WHERE visitor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_org_created
  ON public.messages (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_memberships_user_status
  ON public.organization_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org_status
  ON public.organization_memberships (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_department_members_user
  ON public.department_members (user_id);
CREATE INDEX IF NOT EXISTS idx_department_members_dept_last
  ON public.department_members (department_id, last_assigned_at NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_profiles_org_status
  ON public.profiles (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_contacts_org_updated
  ON public.contacts (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_org_stage
  ON public.intake_requests (organization_id, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_org_created
  ON public.audit_logs (organization_id, created_at DESC);

-- ---------- Shared status vocabulary ----------
CREATE OR REPLACE FUNCTION public.busy_conversation_statuses()
RETURNS conversation_status[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['assigned','active','pending_visitor','pending_internal','escalated']::conversation_status[]
$$;

CREATE OR REPLACE FUNCTION public.claimable_conversation_statuses()
RETURNS conversation_status[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ARRAY['new','waiting','escalated','follow_up']::conversation_status[]
$$;

-- ---------- Atomic claim ----------
-- Returns jsonb: { ok, code, message, assigned_to, assigned_name }
CREATE OR REPLACE FUNCTION public.claim_conversation(_conversation uuid, _user uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conv          public.conversations%ROWTYPE;
  member_role   app_role;
  member_org    uuid;
  prof          public.profiles%ROWTYPE;
  cap           integer;
  current_load  integer;
  owner_name    text;
  in_dept       boolean;
BEGIN
  -- Serialise all claims by this agent so capacity cannot be raced.
  PERFORM pg_advisory_xact_lock(hashtextextended(_user::text, 0));

  SELECT organization_id, role INTO member_org, member_role
  FROM public.organization_memberships
  WHERE user_id = _user AND status = 'active'
  ORDER BY created_at
  LIMIT 1;

  IF member_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_membership',
      'message', 'Your account is not an active member of an organization.');
  END IF;

  SELECT * INTO prof FROM public.profiles WHERE id = _user;
  IF prof.id IS NULL OR prof.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'inactive_profile',
      'message', 'Your account is not active.');
  END IF;

  IF COALESCE(prof.presence, 'offline') <> 'available' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unavailable',
      'message', 'Set your status to Available before claiming a conversation.');
  END IF;

  -- Lock the conversation row: only one transaction proceeds past this point.
  SELECT * INTO conv FROM public.conversations WHERE id = _conversation FOR UPDATE;
  IF conv.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found',
      'message', 'Conversation not found.');
  END IF;

  IF conv.organization_id <> member_org THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'Conversation not found.');
  END IF;

  IF conv.assigned_to IS NOT NULL THEN
    SELECT full_name INTO owner_name FROM public.profiles WHERE id = conv.assigned_to;
    RETURN jsonb_build_object('ok', false, 'code', 'already_claimed',
      'message', 'This conversation was just claimed by ' || COALESCE(owner_name, 'another team member') || '.');
  END IF;

  IF NOT (conv.status = ANY (public.claimable_conversation_statuses())) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_claimable',
      'message', 'This conversation cannot be claimed right now.');
  END IF;

  -- Department eligibility: org-wide viewers may claim anything in the org,
  -- everyone else needs membership of the conversation's department.
  IF conv.department_id IS NULL THEN
    in_dept := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM public.department_members dm
      WHERE dm.user_id = _user AND dm.department_id = conv.department_id
    ) INTO in_dept;
  END IF;

  IF NOT in_dept AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role = member_role AND rp.permission = 'conversation.view_all'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'wrong_department',
      'message', 'This conversation is not in one of your departments.');
  END IF;

  cap := COALESCE(prof.max_concurrent_chats, 0);
  IF cap > 0 THEN
    SELECT count(*) INTO current_load
    FROM public.conversations c
    WHERE c.assigned_to = _user
      AND c.status = ANY (public.busy_conversation_statuses());
    IF current_load >= cap THEN
      RETURN jsonb_build_object('ok', false, 'code', 'at_capacity',
        'message', 'You have reached your maximum number of active conversations.');
    END IF;
  END IF;

  UPDATE public.conversations
     SET assigned_to = _user,
         status      = 'assigned',
         claimed_at  = now(),
         updated_at  = now()
   WHERE id = conv.id AND assigned_to IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_claimed',
      'message', 'This conversation was just claimed by another team member.');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'assigned_to', _user,
    'assigned_name', COALESCE(prof.full_name, 'A team member'),
    'organization_id', conv.organization_id,
    'website_id', conv.website_id,
    'department_id', conv.department_id,
    'reference', conv.reference,
    'previous_status', conv.status
  );
END;
$$;

-- ---------- Round-robin candidate selection (set-based) ----------
CREATE OR REPLACE FUNCTION public.next_round_robin_agent(_department uuid)
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
  LIMIT 1
$$;

-- Assign atomically to the next eligible agent. Returns jsonb or {ok:false}.
CREATE OR REPLACE FUNCTION public.assign_round_robin(_conversation uuid, _department uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cand   record;
  conv   public.conversations%ROWTYPE;
BEGIN
  IF _department IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_department');
  END IF;

  SELECT * INTO conv FROM public.conversations WHERE id = _conversation FOR UPDATE;
  IF conv.id IS NULL OR conv.assigned_to IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unavailable');
  END IF;

  SELECT * INTO cand FROM public.next_round_robin_agent(_department);
  IF cand.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_agent');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(cand.user_id::text, 0));

  UPDATE public.conversations
     SET assigned_to = cand.user_id, status = 'assigned', claimed_at = now(), updated_at = now()
   WHERE id = _conversation AND assigned_to IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'unavailable');
  END IF;

  UPDATE public.department_members SET last_assigned_at = now() WHERE id = cand.membership_id;

  RETURN jsonb_build_object('ok', true, 'user_id', cand.user_id,
    'full_name', COALESCE(cand.full_name, 'Agent'));
END;
$$;

-- ---------- Eligible notification recipients ----------
CREATE OR REPLACE FUNCTION public.eligible_notification_recipients(
  _org uuid,
  _department uuid,
  _pref text
)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT om.user_id
  FROM public.organization_memberships om
  JOIN public.profiles p ON p.id = om.user_id
  LEFT JOIN public.notification_preferences np ON np.user_id = om.user_id
  WHERE om.organization_id = _org
    AND om.status = 'active'
    AND p.status = 'active'
    AND (
      _department IS NULL
      OR EXISTS (
        SELECT 1 FROM public.department_members dm
        WHERE dm.user_id = om.user_id AND dm.department_id = _department
      )
    )
    AND CASE _pref
      WHEN 'inapp_escalations' THEN COALESCE(np.inapp_escalations, true)
      WHEN 'inapp_new_intake'  THEN COALESCE(np.inapp_new_intake, true)
      WHEN 'inapp_sla_breach'  THEN COALESCE(np.inapp_sla_breach, true)
      WHEN 'inapp_low_rating'  THEN COALESCE(np.inapp_low_rating, true)
      ELSE true
    END;
END;
$$;

-- ---------- Least privilege: these are server-side only ----------
REVOKE ALL ON FUNCTION public.claim_conversation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_round_robin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_round_robin_agent(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.eligible_notification_recipients(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_conversation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_round_robin(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_round_robin_agent(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.eligible_notification_recipients(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.busy_conversation_statuses() TO service_role;
GRANT EXECUTE ON FUNCTION public.claimable_conversation_statuses() TO service_role;