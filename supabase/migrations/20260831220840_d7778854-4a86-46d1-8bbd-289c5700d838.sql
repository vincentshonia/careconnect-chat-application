-- 1. New permission rows -------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
  ('agent','conversation.view_department'),
  ('agent','conversation.claim'),
  ('agent','conversation.reply_assigned'),
  ('team_lead','conversation.claim'),
  ('team_lead','conversation.reply_assigned'),
  ('team_lead','conversation.reassign'),
  ('manager','conversation.claim'),
  ('manager','conversation.reply_assigned'),
  ('manager','conversation.reassign'),
  ('administrator','conversation.claim'),
  ('administrator','conversation.reply_assigned'),
  ('administrator','conversation.reassign'),
  ('super_admin','conversation.claim'),
  ('super_admin','conversation.reply_assigned'),
  ('super_admin','conversation.reassign')
ON CONFLICT DO NOTHING;

-- 2. Conversation VIEW: department members keep visibility after assignment
CREATE OR REPLACE FUNCTION public.can_view_conversation(_org uuid, _dept uuid, _assigned uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _org IS NULL THEN false
    WHEN public.has_perm(_org, 'conversation.view_all') THEN true
    WHEN NOT public.is_org_member(_org) THEN false
    WHEN _assigned = auth.uid() THEN true
    WHEN public.has_perm(_org, 'conversation.view_department')
         AND _dept IS NOT NULL
         AND _dept = ANY(public.my_department_ids(_org)) THEN true
    ELSE _assigned IS NULL
      AND (_dept IS NULL OR _dept = ANY(public.my_department_ids(_org)))
  END;
$$;

-- 3. Conversation REPLY authority (separate from view)
CREATE OR REPLACE FUNCTION public.can_reply_conversation(_conversation uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation
      AND c.status NOT IN ('closed','resolved','archived','spam')
      AND public.is_org_member(c.organization_id)
      AND (
        c.assigned_to = auth.uid()
        OR public.has_perm(c.organization_id, 'conversation.reassign')
        OR public.has_perm(c.organization_id, 'conversation.view_all')
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_reply_conversation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_reply_conversation(uuid) TO authenticated;

-- 4. Messages: read follows view, write follows reply authority
DROP POLICY IF EXISTS msg_insert ON public.messages;
CREATE POLICY msg_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_view_conversation_id(conversation_id)
    AND public.can_reply_conversation(conversation_id)
  );

-- 5. Conversations: viewing no longer implies control
DROP POLICY IF EXISTS conv_update ON public.conversations;
CREATE POLICY conv_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (
    public.can_view_conversation(organization_id, department_id, assigned_to)
    AND (
      assigned_to = auth.uid()
      OR public.has_perm(organization_id, 'conversation.assign')
      OR public.has_perm(organization_id, 'conversation.view_all')
    )
  )
  WITH CHECK (
    public.can_view_conversation(organization_id, department_id, assigned_to)
    AND (
      assigned_to = auth.uid()
      OR public.has_perm(organization_id, 'conversation.assign')
      OR public.has_perm(organization_id, 'conversation.view_all')
    )
  );

-- 6. Queue metrics
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_agent_response_at timestamptz;

-- 7. Routing modes; Pacific Health Group defaults to shared queue
ALTER TABLE public.departments ALTER COLUMN routing_method SET DEFAULT 'shared_queue';
UPDATE public.departments SET routing_method = 'shared_queue'
  WHERE routing_method IN ('first_available','manual','') OR routing_method IS NULL;
