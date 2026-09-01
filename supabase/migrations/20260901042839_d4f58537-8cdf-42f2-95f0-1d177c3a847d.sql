CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------- indexes
CREATE INDEX IF NOT EXISTS idx_contacts_org_last_contact ON public.contacts (organization_id, last_contact_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_org_status_last ON public.contacts (organization_id, lead_status, last_contact_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm ON public.contacts USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm ON public.contacts USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_intake_org_created ON public.intake_requests (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_org_stage_created ON public.intake_requests (organization_id, stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_org_type_created ON public.intake_requests (organization_id, request_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_org_dept_created ON public.intake_requests (organization_id, department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_intake_name_trgm ON public.intake_requests USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_intake_reference_trgm ON public.intake_requests USING gin (reference gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_org_name ON public.profiles (organization_id, full_name);
CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm ON public.profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm ON public.profiles USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_audit_action_trgm ON public.audit_logs USING gin (action gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_actor_trgm ON public.audit_logs USING gin (actor_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_qa_reviews_org_created ON public.qa_reviews (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memberships_org_status_role ON public.organization_memberships (organization_id, status, role);

-- ------------------------------------------------------- staff directory
CREATE OR REPLACE FUNCTION public.staff_directory(
  _org uuid,
  _search text DEFAULT NULL,
  _role app_role DEFAULT NULL,
  _dept uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _lim integer := LEAST(GREATEST(COALESCE(_limit,25),1), 100);
  _off integer := GREATEST(COALESCE(_offset,0),0);
  _q text := NULLIF(btrim(COALESCE(_search,'')), '');
  _total bigint;
  _rows jsonb;
BEGIN
  IF NOT public.can_access_org(_org) THEN
    RAISE EXCEPTION 'not authorised for this organization';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _sd_noop() ON COMMIT DROP;

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
    -- Stable ordering: name then user id, so paging never repeats or skips.
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
$$;

REVOKE ALL ON FUNCTION public.staff_directory(uuid, text, app_role, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_directory(uuid, text, app_role, uuid, text, integer, integer) TO authenticated, service_role;

-- ------------------------------------------------- intake stage counters
CREATE OR REPLACE FUNCTION public.intake_stage_counts(
  _org uuid,
  _type text DEFAULT NULL,
  _search text DEFAULT NULL,
  _dept uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH i AS (
    SELECT * FROM public.intake_requests r
    WHERE r.organization_id = _org
      AND public.can_access_org(_org)
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
$$;

REVOKE ALL ON FUNCTION public.intake_stage_counts(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intake_stage_counts(uuid, text, text, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------ AI report
CREATE OR REPLACE FUNCTION public.report_ai(_org uuid, _from timestamptz, _to timestamptz, _dept uuid[] DEFAULT NULL, _website uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
WITH c AS (
  SELECT * FROM public.conversations
  WHERE organization_id=_org AND created_at >= _from AND created_at < _to
    AND (_dept IS NULL OR department_id = ANY(_dept))
    AND (_website IS NULL OR website_id = _website)
), a AS (
  SELECT * FROM public.ai_responses
  WHERE organization_id=_org AND created_at >= _from AND created_at < _to
    AND (_website IS NULL OR website_id = _website)
), answered AS (
  -- Conversations the assistant actually answered at least once.
  SELECT c.* FROM c WHERE EXISTS (SELECT 1 FROM a WHERE a.conversation_id = c.id)
)
SELECT jsonb_build_object(
  'conversations', (SELECT COUNT(*) FROM c),
  'ai_answers', (SELECT COUNT(*) FROM a),
  'answered_conversations', (SELECT COUNT(*) FROM answered),
  -- AI-only: assistant answered and no human was ever requested or assigned.
  'ai_only', (SELECT COUNT(*) FROM answered
      WHERE NOT escalation_requested AND assigned_to IS NULL
        AND first_human_requested_at IS NULL AND requested_agent_at IS NULL),
  'ai_only_rate', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(
      COUNT(*) FILTER (WHERE NOT escalation_requested AND assigned_to IS NULL
        AND first_human_requested_at IS NULL AND requested_agent_at IS NULL) * 100.0 / COUNT(*), 1)
      END FROM answered),
  'escalated', (SELECT COUNT(*) FROM answered WHERE escalation_requested),
  'escalation_rate', (SELECT CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE escalation_requested) * 100.0 / COUNT(*), 1) END FROM answered),
  -- Left without an outcome: no human requested, but nothing was resolved either.
  'abandoned', (SELECT COUNT(*) FROM answered
      WHERE NOT escalation_requested AND assigned_to IS NULL
        AND resolved_at IS NULL AND closed_at IS NULL),
  'avg_confidence', (SELECT ROUND(AVG(confidence)::numeric,2) FROM a),
  'low_confidence', (SELECT COUNT(*) FROM a WHERE confidence IS NOT NULL AND confidence < 0.5),
  'rated', (SELECT COUNT(*) FROM a WHERE visitor_feedback IS NOT NULL),
  'helpful_rate', (SELECT CASE WHEN COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE visitor_feedback='helpful') * 100.0
        / COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL),1) END FROM a),
  'unhelpful_rate', (SELECT CASE WHEN COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE visitor_feedback='not_helpful') * 100.0
        / COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL),1) END FROM a),
  'escalations_by_department', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(d.name,'Unassigned') AS department, COUNT(*) AS n
      FROM c LEFT JOIN public.departments d ON d.id = c.department_id
      WHERE c.escalation_requested GROUP BY 1 ORDER BY 2 DESC LIMIT 25) x), '[]'::jsonb),
  'top_questions', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT left(question, 140) AS question, COUNT(*) AS n
      FROM a GROUP BY 1 ORDER BY 2 DESC LIMIT 15) x), '[]'::jsonb),
  'low_confidence_questions', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT left(question, 140) AS question, ROUND(AVG(confidence)::numeric,2) AS confidence, COUNT(*) AS n
      FROM a WHERE confidence IS NOT NULL AND confidence < 0.5
      GROUP BY 1 ORDER BY 3 DESC LIMIT 15) x), '[]'::jsonb)
)
$$;

-- ----------------------------------------------------- transfers report
CREATE OR REPLACE FUNCTION public.report_transfers(_org uuid, _from timestamptz, _to timestamptz, _dept uuid[] DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
WITH e AS (
  SELECT ev.*, c.reference, c.status, c.department_id AS final_department_id, c.assigned_to AS final_agent_id
  FROM public.conversation_events ev
  JOIN public.conversations c ON c.id = ev.conversation_id
  WHERE ev.organization_id = _org AND ev.event_type = 'transferred'
    AND ev.created_at >= _from AND ev.created_at < _to
    AND (_dept IS NULL OR ev.previous_value::uuid = ANY(_dept) OR ev.new_value::uuid = ANY(_dept))
), conv AS (
  SELECT COUNT(DISTINCT conversation_id) AS transferred_conversations, COUNT(*) AS transfer_events FROM e
), multi AS (
  SELECT COUNT(*) AS n FROM (
    SELECT conversation_id FROM e GROUP BY conversation_id HAVING COUNT(*) > 1
  ) z
), scope AS (
  SELECT COUNT(*) AS total FROM public.conversations
  WHERE organization_id = _org AND created_at >= _from AND created_at < _to
    AND (_dept IS NULL OR department_id = ANY(_dept))
)
SELECT jsonb_build_object(
  'overview', jsonb_build_object(
    'transferred_conversations', (SELECT transferred_conversations FROM conv),
    'transfer_events', (SELECT transfer_events FROM conv),
    'multi_transfer_conversations', (SELECT n FROM multi),
    'period_conversations', (SELECT total FROM scope),
    'transfer_rate', CASE WHEN (SELECT total FROM scope) > 0
      THEN ROUND((SELECT transferred_conversations FROM conv) * 100.0 / (SELECT total FROM scope), 1) END,
    'multi_transfer_rate', CASE WHEN (SELECT transferred_conversations FROM conv) > 0
      THEN ROUND((SELECT n FROM multi) * 100.0 / (SELECT transferred_conversations FROM conv), 1) END,
    'avg_transfers_per_conversation', CASE WHEN (SELECT transferred_conversations FROM conv) > 0
      THEN ROUND((SELECT transfer_events FROM conv)::numeric / (SELECT transferred_conversations FROM conv), 2) END
  ),
  'matrix', COALESCE((SELECT jsonb_agg(m) FROM (
      SELECT COALESCE(df.name,'Unassigned') AS from_department,
             COALESCE(dt.name,'Unassigned') AS to_department,
             COUNT(*) AS n
      FROM e
      LEFT JOIN public.departments df ON df.id = e.previous_value::uuid
      LEFT JOIN public.departments dt ON dt.id = e.new_value::uuid
      GROUP BY 1,2 ORDER BY 3 DESC LIMIT 200
    ) m), '[]'::jsonb),
  'rows_total', (SELECT transfer_events FROM conv),
  'rows', COALESCE((SELECT jsonb_agg(r) FROM (
      SELECT e.conversation_id, e.reference, e.created_at AS transferred_at,
             COALESCE(df.name,'Unassigned') AS from_department,
             COALESCE(dt.name,'Unassigned') AS to_department,
             pa.full_name AS transferred_by, e.detail AS note,
             e.status::text AS status_after,
             COALESCE(dfin.name,'—') AS final_department,
             pf.full_name AS final_agent
      FROM e
      LEFT JOIN public.departments df ON df.id = e.previous_value::uuid
      LEFT JOIN public.departments dt ON dt.id = e.new_value::uuid
      LEFT JOIN public.departments dfin ON dfin.id = e.final_department_id
      LEFT JOIN public.profiles pa ON pa.id = e.actor_id
      LEFT JOIN public.profiles pf ON pf.id = e.final_agent_id
      -- id breaks ties so identical timestamps cannot repeat across pages.
      ORDER BY e.created_at DESC, e.id
      LIMIT LEAST(GREATEST(COALESCE(_limit,50),1),200) OFFSET GREATEST(COALESCE(_offset,0),0)
    ) r), '[]'::jsonb),
  'repeat_conversations', COALESCE((SELECT jsonb_agg(z) FROM (
      SELECT e.conversation_id, MAX(e.reference) AS reference, COUNT(*) AS transfers,
             MAX(e.created_at) AS last_transfer_at
      FROM e GROUP BY e.conversation_id HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC LIMIT 50
    ) z), '[]'::jsonb)
)
$$;

-- -------------------------------------------------------- intake report
CREATE OR REPLACE FUNCTION public.report_intake(_org uuid, _from timestamptz, _to timestamptz, _dept uuid[] DEFAULT NULL, _staff uuid[] DEFAULT NULL, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
WITH i AS (
  SELECT * FROM public.intake_requests
  WHERE organization_id=_org AND created_at >= _from AND created_at < _to
    AND (_dept IS NULL OR department_id = ANY(_dept))
    AND (_staff IS NULL OR assigned_to = ANY(_staff))
)
SELECT jsonb_build_object(
  'total', (SELECT COUNT(*) FROM i),
  'by_type', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT request_type::text AS request_type, COUNT(*) AS total,
        COUNT(*) FILTER (WHERE stage::text IN ('new','in_review','contacted','eligibility_check','submitted')) AS open,
        COUNT(*) FILTER (WHERE stage::text = 'approved') AS approved,
        COUNT(*) FILTER (WHERE stage::text = 'denied') AS denied,
        COUNT(*) FILTER (WHERE stage::text = 'withdrawn') AS withdrawn,
        CASE WHEN COUNT(*) > 0 THEN ROUND(COUNT(*) FILTER (WHERE stage::text='approved') * 100.0 / COUNT(*),1) END AS conversion
      FROM i GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_stage', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT stage::text AS stage, COUNT(*) AS n FROM i GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_department', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(d.name,'Unassigned') AS department, COUNT(*) AS n,
        COUNT(*) FILTER (WHERE i.stage::text='approved') AS approved
      FROM i LEFT JOIN public.departments d ON d.id = i.department_id
      GROUP BY 1 ORDER BY 2 DESC LIMIT 100) x), '[]'::jsonb),
  'by_staff', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(p.full_name,'Unassigned') AS staff, COUNT(*) AS n,
        COUNT(*) FILTER (WHERE i.stage::text='approved') AS approved
      FROM i LEFT JOIN public.profiles p ON p.id = i.assigned_to
      GROUP BY 1 ORDER BY 2 DESC LIMIT 100) x), '[]'::jsonb),
  'by_service', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(service_interest,'Not stated') AS service, COUNT(*) AS n
      FROM i GROUP BY 1 ORDER BY 2 DESC LIMIT 20) x), '[]'::jsonb),
  'by_county', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(county,'Not stated') AS county, COUNT(*) AS n
      FROM i GROUP BY 1 ORDER BY 2 DESC LIMIT 20) x), '[]'::jsonb),
  'by_health_plan', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(health_plan,'Not stated') AS health_plan, COUNT(*) AS n
      FROM i GROUP BY 1 ORDER BY 2 DESC LIMIT 20) x), '[]'::jsonb),
  'rows_total', (SELECT COUNT(*) FROM i),
  'rows', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT i.id, i.reference, i.created_at, i.request_type::text AS request_type, i.stage::text AS stage,
             i.full_name, i.service_interest, i.county, i.health_plan,
             d.name AS department, p.full_name AS assigned_name
      FROM i LEFT JOIN public.departments d ON d.id = i.department_id
      LEFT JOIN public.profiles p ON p.id = i.assigned_to
      ORDER BY i.created_at DESC, i.id
      LIMIT LEAST(GREATEST(COALESCE(_limit,50),1),200) OFFSET GREATEST(COALESCE(_offset,0),0)) x), '[]'::jsonb)
)
$$;

REVOKE ALL ON FUNCTION public.report_ai(uuid, timestamptz, timestamptz, uuid[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_transfers(uuid, timestamptz, timestamptz, uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_intake(uuid, timestamptz, timestamptz, uuid[], uuid[], integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_ai(uuid, timestamptz, timestamptz, uuid[], uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_transfers(uuid, timestamptz, timestamptz, uuid[], integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_intake(uuid, timestamptz, timestamptz, uuid[], uuid[], integer, integer) TO service_role;

DROP FUNCTION IF EXISTS public.report_transfers(uuid, timestamptz, timestamptz, uuid[], integer);
DROP FUNCTION IF EXISTS public.report_intake(uuid, timestamptz, timestamptz, uuid[], uuid[]);