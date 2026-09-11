-- ---------------------------------------------------------------
-- 1. Browser becomes read-only on staff-managed tables.
--    Every write now runs through an audited server function using
--    the service role, so these client policies are removed.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS bh_write ON public.business_hours;
DROP POLICY IF EXISTS hol_write ON public.holidays;
DROP POLICY IF EXISTS dept_write ON public.departments;
DROP POLICY IF EXISTS dept_manage ON public.departments;
DROP POLICY IF EXISTS dm_write ON public.department_members;
DROP POLICY IF EXISTS dm_manage ON public.department_members;
DROP POLICY IF EXISTS rr_write ON public.routing_rules;
DROP POLICY IF EXISTS rr_manage ON public.routing_rules;
DROP POLICY IF EXISTS rt_write ON public.response_templates;
DROP POLICY IF EXISTS rt_manage ON public.response_templates;
DROP POLICY IF EXISTS qa_write ON public.qa_reviews;
DROP POLICY IF EXISTS qa_manage ON public.qa_reviews;
DROP POLICY IF EXISTS contacts_insert ON public.contacts;
DROP POLICY IF EXISTS contacts_update ON public.contacts;
DROP POLICY IF EXISTS contacts_delete ON public.contacts;
DROP POLICY IF EXISTS intake_insert ON public.intake_requests;
DROP POLICY IF EXISTS intake_update ON public.intake_requests;
DROP POLICY IF EXISTS intake_delete ON public.intake_requests;
DROP POLICY IF EXISTS intake_events_insert ON public.intake_events;
DROP POLICY IF EXISTS notes_insert ON public.internal_notes;
DROP POLICY IF EXISTS notes_delete ON public.internal_notes;
DROP POLICY IF EXISTS internal_notes_insert ON public.internal_notes;
DROP POLICY IF EXISTS internal_notes_delete ON public.internal_notes;

-- Administrators edited other people's profiles from the browser; that now
-- runs server-side. Self-service profile updates stay untouched.
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;

REVOKE INSERT, UPDATE, DELETE ON
  public.business_hours, public.holidays, public.departments,
  public.department_members, public.routing_rules, public.response_templates,
  public.qa_reviews, public.contacts, public.intake_requests,
  public.intake_events, public.internal_notes
FROM authenticated;

-- ---------------------------------------------------------------
-- 2. Identity helpers ignore a supplied user id unless the caller is
--    a platform admin. Otherwise any signed-in user could probe or
--    borrow another person's access by passing their id.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.effective_user(_user uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN _user IS NULL OR _user = auth.uid() THEN auth.uid()
    WHEN EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
      THEN _user
    ELSE auth.uid()
  END;
$$;
REVOKE ALL ON FUNCTION public.effective_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.effective_user(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_can(_perm text, _user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    JOIN public.platform_role_permissions prp ON prp.role = pa.role
    WHERE pa.user_id = public.effective_user(_user) AND prp.permission = _perm);
$$;

CREATE OR REPLACE FUNCTION public.platform_role_of(_user uuid DEFAULT auth.uid())
RETURNS platform_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.platform_admins
  WHERE user_id = public.effective_user(_user) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_org uuid, _user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _org IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.user_id = public.effective_user(_user)
      AND m.organization_id = _org AND m.status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.org_role_of(_org uuid, _user uuid DEFAULT auth.uid())
RETURNS app_role
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.role FROM public.organization_memberships m
  WHERE m.user_id = public.effective_user(_user)
    AND m.organization_id = _org AND m.status = 'active' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.org_role_rank(_org uuid, _user uuid DEFAULT auth.uid())
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT CASE m.role
      WHEN 'super_admin' THEN 5 WHEN 'administrator' THEN 4 WHEN 'manager' THEN 3
      WHEN 'team_lead' THEN 2 ELSE 1 END
    FROM public.organization_memberships m
    WHERE m.user_id = public.effective_user(_user)
      AND m.organization_id = _org AND m.status = 'active'), 0);
$$;

CREATE OR REPLACE FUNCTION public.my_department_ids(_org uuid, _user uuid DEFAULT auth.uid())
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(dm.department_id), '{}')
  FROM public.department_members dm
  WHERE dm.user_id = public.effective_user(_user) AND dm.organization_id = _org;
$$;

CREATE OR REPLACE FUNCTION public.has_perm(_org uuid, _perm text, _user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _org IS NOT NULL AND (
    public.platform_can('platform.tenant_admin', public.effective_user(_user))
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships m
      JOIN public.role_permissions rp ON rp.role = m.role
      WHERE m.user_id = public.effective_user(_user) AND m.organization_id = _org
        AND m.status = 'active' AND rp.permission = _perm));
$$;

-- ---------------------------------------------------------------
-- 3. Quality reviews get their own permission.
-- ---------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission)
VALUES ('team_lead','quality.review'), ('manager','quality.review'),
       ('administrator','quality.review'), ('super_admin','quality.review')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------
-- 4. Directory + intake counts respect the caller's visibility.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_directory(_org uuid, _search text DEFAULT NULL::text, _role app_role DEFAULT NULL::app_role, _dept uuid DEFAULT NULL::uuid, _status text DEFAULT NULL::text, _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _lim integer := LEAST(GREATEST(COALESCE(_limit,25),1), 100);
  _off integer := GREATEST(COALESCE(_offset,0),0);
  _q text := NULLIF(btrim(COALESCE(_search,'')), '');
  _total bigint;
  _rows jsonb;
BEGIN
  IF NOT public.can_access_org(_org) OR NOT public.has_perm(_org, 'staff.view') THEN
    RAISE EXCEPTION 'not authorised for this organization';
  END IF;

  WITH base AS (
    SELECT m.user_id, m.role, m.status AS membership_status, m.title AS membership_title,
           p.full_name, p.email, p.title, p.presence, p.status AS profile_status,
           p.max_concurrent_chats, p.phone
    FROM public.organization_memberships m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.organization_id = _org
      AND (_role IS NULL OR m.role = _role)
      AND (_status IS NULL OR _status = 'all'
           OR (_status = 'active' AND m.status = 'active' AND p.status = 'active')
           OR (_status = 'disabled' AND (m.status = 'suspended' OR p.status = 'inactive'))
           OR (_status = 'removed' AND (m.status = 'removed' OR p.status = 'archived')))
      AND (_dept IS NULL OR EXISTS (
            SELECT 1 FROM public.department_members dm
            WHERE dm.user_id = m.user_id AND dm.department_id = _dept))
      AND (_q IS NULL
           OR p.full_name ILIKE '%'||_q||'%'
           OR p.email ILIKE '%'||_q||'%'
           OR COALESCE(p.title,'') ILIKE '%'||_q||'%')
  )
  SELECT COUNT(*) INTO _total FROM base;

  WITH base AS (
    SELECT m.user_id, m.role, m.status AS membership_status,
           p.full_name, p.email, p.title, p.presence, p.status AS profile_status,
           p.max_concurrent_chats, p.phone
    FROM public.organization_memberships m
    JOIN public.profiles p ON p.id = m.user_id
    WHERE m.organization_id = _org
      AND (_role IS NULL OR m.role = _role)
      AND (_status IS NULL OR _status = 'all'
           OR (_status = 'active' AND m.status = 'active' AND p.status = 'active')
           OR (_status = 'disabled' AND (m.status = 'suspended' OR p.status = 'inactive'))
           OR (_status = 'removed' AND (m.status = 'removed' OR p.status = 'archived')))
      AND (_dept IS NULL OR EXISTS (
            SELECT 1 FROM public.department_members dm
            WHERE dm.user_id = m.user_id AND dm.department_id = _dept))
      AND (_q IS NULL
           OR p.full_name ILIKE '%'||_q||'%'
           OR p.email ILIKE '%'||_q||'%'
           OR COALESCE(p.title,'') ILIKE '%'||_q||'%')
    ORDER BY p.full_name NULLS LAST, m.user_id
    LIMIT _lim OFFSET _off
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(b) || jsonb_build_object(
           'departments',
           COALESCE((SELECT jsonb_agg(jsonb_build_object('id', dm.department_id, 'membership_id', dm.id))
                     FROM public.department_members dm
                     WHERE dm.user_id = b.user_id AND dm.organization_id = _org), '[]'::jsonb)
         )), '[]'::jsonb)
    INTO _rows
  FROM base b;

  RETURN jsonb_build_object('total', _total, 'rows', _rows);
END;
$function$;

CREATE OR REPLACE FUNCTION public.intake_stage_counts(_org uuid, _type text DEFAULT NULL::text, _search text DEFAULT NULL::text, _dept uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH i AS (
    SELECT * FROM public.intake_requests r
    WHERE r.organization_id = _org
      AND public.can_access_org(_org)
      -- Counts now match exactly the rows the caller may read.
      AND public.can_view_intake(r.organization_id, r.department_id, r.assigned_to)
      AND (_type IS NULL OR _type = 'all' OR r.request_type::text = _type)
      AND (_dept IS NULL OR r.department_id = _dept)
      AND (NULLIF(btrim(COALESCE(_search,'')),'') IS NULL
           OR r.full_name ILIKE '%'||btrim(_search)||'%'
           OR r.reference ILIKE '%'||btrim(_search)||'%'
           OR COALESCE(r.email,'') ILIKE '%'||btrim(_search)||'%'
           OR COALESCE(r.phone,'') ILIKE '%'||btrim(_search)||'%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT COUNT(*) FROM i),
    'by_stage', COALESCE((SELECT jsonb_object_agg(stage, n) FROM (
        SELECT stage::text AS stage, COUNT(*) AS n FROM i GROUP BY 1) s), '{}'::jsonb),
    'by_type', COALESCE((SELECT jsonb_object_agg(t, n) FROM (
        SELECT request_type::text AS t, COUNT(*) AS n FROM i GROUP BY 1) z), '{}'::jsonb)
  )
$function$;

-- ---------------------------------------------------------------
-- 5. Indexes for common filters.
-- ---------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON public.conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_intake_contact ON public.intake_requests(contact_id);
CREATE INDEX IF NOT EXISTS idx_intake_assigned ON public.intake_requests(assigned_to);
CREATE INDEX IF NOT EXISTS idx_intake_conversation ON public.intake_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_message ON public.ai_responses(message_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_record ON public.audit_logs(record_type, record_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_org_status ON public.knowledge_articles(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_org ON public.knowledge_chunks(organization_id);
CREATE INDEX IF NOT EXISTS idx_websites_org ON public.websites(organization_id);
CREATE INDEX IF NOT EXISTS idx_visitors_org_website ON public.visitors(organization_id, website_id);
CREATE INDEX IF NOT EXISTS idx_routing_rules_org_website ON public.routing_rules(organization_id, website_id);
CREATE INDEX IF NOT EXISTS idx_response_templates_org ON public.response_templates(organization_id);
CREATE INDEX IF NOT EXISTS idx_qa_reviews_agent ON public.qa_reviews(agent_id);

-- Exact duplicates: keep the earlier-named copy (and the constraint-backed
-- unique index on rate_limits), drop the redundant one.
DROP INDEX IF EXISTS public.idx_ai_responses_org_created;
DROP INDEX IF EXISTS public.idx_audit_org_created;
DROP INDEX IF EXISTS public.idx_conversation_ratings_org_created;
DROP INDEX IF EXISTS public.idx_conversations_org_created;
DROP INDEX IF EXISTS public.idx_conversations_org_dept_status;
DROP INDEX IF EXISTS public.conversations_org_status_last_message_idx;
DROP INDEX IF EXISTS public.idx_conversations_org_status_last_msg;
DROP INDEX IF EXISTS public.idx_department_members_dept_last;
DROP INDEX IF EXISTS public.messages_conv_idx;
DROP INDEX IF EXISTS public.notifications_user_idx;
DROP INDEX IF EXISTS public.idx_org_memberships_org;
DROP INDEX IF EXISTS public.idx_org_memberships_user;
DROP INDEX IF EXISTS public.qa_reviews_org_idx;
DROP INDEX IF EXISTS public.rate_limits_bucket_key_idx;