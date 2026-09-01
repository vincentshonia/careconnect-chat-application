-- Tickets -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_tickets(
  _org uuid, _from timestamptz, _to timestamptz,
  _dept uuid[] DEFAULT NULL, _staff uuid[] DEFAULT NULL, _statuses text[] DEFAULT NULL,
  _website uuid DEFAULT NULL, _type text DEFAULT NULL, _transfer text DEFAULT NULL,
  _priority text DEFAULT NULL, _sla integer DEFAULT 15,
  _flag text DEFAULT 'all', _sort text DEFAULT 'created_at', _dir text DEFAULT 'desc',
  _limit integer DEFAULT 50, _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  sort_col text;
  dir text := CASE WHEN lower(_dir) = 'asc' THEN 'asc' ELSE 'desc' END;
  flag_sql text := '';
  total bigint;
  rows jsonb;
BEGIN
  sort_col := CASE _sort
    WHEN 'reference' THEN 'reference'
    WHEN 'status' THEN 'status::text'
    WHEN 'department' THEN 'department_name'
    WHEN 'assigned' THEN 'assigned_name'
    WHEN 'priority' THEN 'priority::text'
    WHEN 'transfer_count' THEN 'transfer_count'
    WHEN 'claim_min' THEN 'claim_min'
    WHEN 'resp_min' THEN 'resp_min'
    WHEN 'res_min' THEN 'res_min'
    WHEN 'last_activity' THEN 'last_message_at'
    WHEN 'resolved_at' THEN 'resolved_at'
    WHEN 'closed_at' THEN 'closed_at'
    WHEN 'csat' THEN 'csat'
    ELSE 'created_at' END;

  flag_sql := CASE _flag
    WHEN 'open' THEN ' AND status::text NOT IN (''resolved'',''closed'',''archived'',''spam'')'
    WHEN 'completed' THEN ' AND status::text IN (''resolved'',''closed'')'
    WHEN 'resolved' THEN ' AND status::text = ''resolved'''
    WHEN 'closed' THEN ' AND status::text = ''closed'''
    WHEN 'unassigned' THEN ' AND assigned_to IS NULL AND status::text NOT IN (''resolved'',''closed'',''archived'',''spam'')'
    WHEN 'breach' THEN format(' AND escalation_requested AND (resp_min IS NULL OR resp_min > %s) AND status::text NOT IN (''archived'',''spam'')', _sla)
    WHEN 'no_response' THEN ' AND escalation_requested AND first_agent_response_at IS NULL'
    WHEN 'stale' THEN ' AND status::text NOT IN (''resolved'',''closed'',''archived'',''spam'') AND last_message_at < now() - interval ''4 hours'''
    WHEN 'aged' THEN ' AND status::text NOT IN (''resolved'',''closed'',''archived'',''spam'') AND created_at < now() - interval ''24 hours'''
    WHEN 'multi_transfer' THEN ' AND COALESCE(transfer_count,0) > 1'
    ELSE '' END;

  CREATE TEMP TABLE IF NOT EXISTS _rt (x int) ON COMMIT DROP;

  EXECUTE format($q$
    WITH base AS (
      SELECT c.*,
        COALESCE(c.first_human_requested_at, c.requested_agent_at, c.created_at) AS queue_at,
        COALESCE(c.resolved_at, c.closed_at) AS done_at,
        d.name AS department_name,
        p.full_name AS assigned_name,
        ct.full_name AS contact_name,
        w.name AS website_name,
        (SELECT ROUND(AVG(r.score)::numeric,1) FROM public.conversation_ratings r WHERE r.conversation_id = c.id) AS csat
      FROM public.report_conv($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) c
      LEFT JOIN public.departments d ON d.id = c.department_id
      LEFT JOIN public.profiles p ON p.id = c.assigned_to
      LEFT JOIN public.contacts ct ON ct.id = c.contact_id
      LEFT JOIN public.websites w ON w.id = c.website_id
    ), calc AS (
      SELECT b.*,
        EXTRACT(EPOCH FROM (b.claimed_at - b.queue_at))/60 AS claim_min,
        EXTRACT(EPOCH FROM (b.first_agent_response_at - b.queue_at))/60 AS resp_min,
        EXTRACT(EPOCH FROM (b.done_at - b.created_at))/60 AS res_min,
        EXTRACT(EPOCH FROM (b.done_at - b.claimed_at))/60 AS handle_min
      FROM base b
    ), filtered AS (
      SELECT * FROM calc WHERE true %s
    )
    SELECT (SELECT COUNT(*) FROM filtered),
      COALESCE((SELECT jsonb_agg(t) FROM (
        SELECT id, reference, created_at, website_name, contact_name, department_id, department_name,
               assigned_to, assigned_name, status::text AS status, priority::text AS priority,
               is_ai_only, escalation_requested, COALESCE(transfer_count,0) AS transfer_count,
               ROUND(claim_min::numeric,1) AS claim_min, ROUND(resp_min::numeric,1) AS resp_min,
               ROUND(res_min::numeric,1) AS res_min, ROUND(handle_min::numeric,1) AS handle_min,
               last_message_at, last_visitor_message_at, last_agent_message_at,
               resolved_at, closed_at, csat,
               (escalation_requested AND (resp_min IS NULL OR resp_min > %s)) AS sla_breached
        FROM filtered ORDER BY %I %s NULLS LAST LIMIT %s OFFSET %s
      ) t), '[]'::jsonb)
  $q$, flag_sql, _sla, sort_col, dir, GREATEST(_limit,1), GREATEST(_offset,0))
  INTO total, rows
  USING _org, _from, _to, _dept, _staff, _statuses, _website, _type, _transfer, _priority;

  RETURN jsonb_build_object('total', total, 'rows', rows);
END;
$fn$;

-- Transfers ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_transfers(
  _org uuid, _from timestamptz, _to timestamptz,
  _dept uuid[] DEFAULT NULL, _limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
      GROUP BY 1,2 ORDER BY 3 DESC
    ) m), '[]'::jsonb),
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
      ORDER BY e.created_at DESC LIMIT GREATEST(_limit,1)
    ) r), '[]'::jsonb),
  'repeat_conversations', COALESCE((SELECT jsonb_agg(z) FROM (
      SELECT e.conversation_id, MAX(e.reference) AS reference, COUNT(*) AS transfers,
             MAX(e.created_at) AS last_transfer_at
      FROM e GROUP BY e.conversation_id HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC LIMIT 100
    ) z), '[]'::jsonb)
)
$$;

-- SLA & response -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_sla(
  _org uuid, _from timestamptz, _to timestamptz,
  _dept uuid[] DEFAULT NULL, _staff uuid[] DEFAULT NULL, _statuses text[] DEFAULT NULL,
  _website uuid DEFAULT NULL, _type text DEFAULT NULL, _transfer text DEFAULT NULL,
  _priority text DEFAULT NULL, _sla integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH c AS (
  SELECT *,
    COALESCE(first_human_requested_at, requested_agent_at, created_at) AS queue_at,
    COALESCE(resolved_at, closed_at) AS done_at
  FROM public.report_conv(_org,_from,_to,_dept,_staff,_statuses,_website,_type,_transfer,_priority)
), t AS (
  SELECT c.*,
    EXTRACT(EPOCH FROM (c.claimed_at - c.queue_at))/60 AS claim_min,
    EXTRACT(EPOCH FROM (c.first_agent_response_at - c.queue_at))/60 AS resp_min,
    EXTRACT(EPOCH FROM (c.done_at - c.claimed_at))/60 AS handle_min,
    EXTRACT(EPOCH FROM (c.done_at - c.created_at))/60 AS res_min
  FROM c
)
SELECT jsonb_build_object(
  'metrics', (SELECT jsonb_build_object(
      'avg_claim', ROUND(AVG(claim_min)::numeric,1),
      'median_claim', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY claim_min))::numeric,1),
      'avg_response', ROUND(AVG(resp_min)::numeric,1),
      'median_response', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY resp_min))::numeric,1),
      'avg_handle', ROUND(AVG(handle_min)::numeric,1),
      'avg_resolution', ROUND(AVG(res_min)::numeric,1),
      'p50', ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY resp_min))::numeric,1),
      'p75', ROUND((percentile_cont(0.75) WITHIN GROUP (ORDER BY resp_min))::numeric,1),
      'p90', ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY resp_min))::numeric,1),
      'p95', ROUND((percentile_cont(0.95) WITHIN GROUP (ORDER BY resp_min))::numeric,1),
      'sample', COUNT(*) FILTER (WHERE resp_min IS NOT NULL),
      'sla_eligible', COUNT(*) FILTER (WHERE escalation_requested),
      'sla_met', COUNT(*) FILTER (WHERE escalation_requested AND resp_min IS NOT NULL AND resp_min <= _sla),
      'breaches', COUNT(*) FILTER (WHERE escalation_requested AND (resp_min IS NULL OR resp_min > _sla))
    ) FROM t),
  'oldest_waiting_at', (SELECT MIN(COALESCE(first_human_requested_at, requested_agent_at, created_at))
      FROM public.conversations WHERE organization_id=_org AND assigned_to IS NULL
        AND status::text IN ('new','waiting','escalated','follow_up')
        AND (_dept IS NULL OR department_id = ANY(_dept))),
  'oldest_active_at', (SELECT MIN(created_at) FROM public.conversations
      WHERE organization_id=_org AND status::text IN ('assigned','active')
        AND (_dept IS NULL OR department_id = ANY(_dept))),
  'by_department', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(d.name,'Unassigned') AS department,
        COUNT(*) AS conversations,
        ROUND(AVG(t.resp_min)::numeric,1) AS avg_response,
        ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY t.resp_min))::numeric,1) AS p90_response,
        COUNT(*) FILTER (WHERE t.escalation_requested AND (t.resp_min IS NULL OR t.resp_min > _sla)) AS breaches
      FROM t LEFT JOIN public.departments d ON d.id = t.department_id
      GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_staff', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(p.full_name,'Unassigned') AS staff,
        COUNT(*) AS conversations,
        ROUND(AVG(t.resp_min)::numeric,1) AS avg_response,
        ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY t.resp_min))::numeric,1) AS p90_response,
        COUNT(*) FILTER (WHERE t.escalation_requested AND (t.resp_min IS NULL OR t.resp_min > _sla)) AS breaches
      FROM t LEFT JOIN public.profiles p ON p.id = t.assigned_to
      WHERE t.assigned_to IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_day', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'day') FROM (
      SELECT jsonb_build_object(
        'day', to_char(date_trunc('day', t.created_at), 'YYYY-MM-DD'),
        'conversations', COUNT(*),
        'avg_response', ROUND(AVG(t.resp_min)::numeric,1),
        'breaches', COUNT(*) FILTER (WHERE t.escalation_requested AND (t.resp_min IS NULL OR t.resp_min > _sla))
      ) AS x FROM t GROUP BY date_trunc('day', t.created_at)) y), '[]'::jsonb),
  'by_hour', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'hour')::int) FROM (
      SELECT jsonb_build_object(
        'hour', EXTRACT(HOUR FROM t.created_at)::int,
        'conversations', COUNT(*),
        'avg_response', ROUND(AVG(t.resp_min)::numeric,1)
      ) AS x FROM t GROUP BY EXTRACT(HOUR FROM t.created_at)) y), '[]'::jsonb)
)
$$;

-- Volume ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_volume(
  _org uuid, _from timestamptz, _to timestamptz,
  _dept uuid[] DEFAULT NULL, _staff uuid[] DEFAULT NULL, _statuses text[] DEFAULT NULL,
  _website uuid DEFAULT NULL, _type text DEFAULT NULL, _transfer text DEFAULT NULL,
  _priority text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH c AS (
  SELECT * FROM public.report_conv(_org,_from,_to,_dept,_staff,_statuses,_website,_type,_transfer,_priority)
)
SELECT jsonb_build_object(
  'by_day', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'day') FROM (
    SELECT jsonb_build_object(
      'day', to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
      'conversations', COUNT(*),
      'escalated', COUNT(*) FILTER (WHERE escalation_requested),
      'completed', COUNT(*) FILTER (WHERE status::text IN ('resolved','closed'))
    ) AS x FROM c GROUP BY date_trunc('day', created_at)) y), '[]'::jsonb),
  'by_hour', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'hour')::int) FROM (
    SELECT jsonb_build_object(
      'hour', EXTRACT(HOUR FROM created_at)::int,
      'conversations', COUNT(*),
      'human_requests', COUNT(*) FILTER (WHERE escalation_requested)
    ) AS x FROM c GROUP BY EXTRACT(HOUR FROM created_at)) y), '[]'::jsonb),
  'by_weekday', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'weekday')::int) FROM (
    SELECT jsonb_build_object(
      'weekday', EXTRACT(DOW FROM created_at)::int,
      'conversations', COUNT(*)
    ) AS x FROM c GROUP BY EXTRACT(DOW FROM created_at)) y), '[]'::jsonb),
  'peak_day', (SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') FROM c
     GROUP BY date_trunc('day', created_at) ORDER BY COUNT(*) DESC LIMIT 1),
  'peak_day_count', (SELECT COUNT(*) FROM c GROUP BY date_trunc('day', created_at) ORDER BY COUNT(*) DESC LIMIT 1)
)
$$;

-- AI --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_ai(
  _org uuid, _from timestamptz, _to timestamptz,
  _dept uuid[] DEFAULT NULL, _website uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
)
SELECT jsonb_build_object(
  'conversations', (SELECT COUNT(*) FROM c),
  'ai_answers', (SELECT COUNT(*) FROM a),
  'ai_only', (SELECT COUNT(*) FROM c WHERE is_ai_only AND NOT escalation_requested),
  'escalated', (SELECT COUNT(*) FROM c WHERE escalation_requested),
  'escalation_rate', (SELECT CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE escalation_requested) * 100.0 / COUNT(*), 1) END FROM c),
  'deflected', (SELECT COUNT(*) FROM c
      WHERE NOT escalation_requested AND EXISTS (SELECT 1 FROM a WHERE a.conversation_id = c.id)),
  'deflection_rate', (SELECT CASE WHEN COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM a WHERE a.conversation_id=c.id)) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE NOT escalation_requested AND EXISTS (SELECT 1 FROM a WHERE a.conversation_id=c.id)) * 100.0
        / COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM a WHERE a.conversation_id=c.id)), 1) END FROM c),
  'avg_confidence', (SELECT ROUND(AVG(confidence)::numeric,2) FROM a),
  'low_confidence', (SELECT COUNT(*) FROM a WHERE confidence IS NOT NULL AND confidence < 0.5),
  'helpful_pct', (SELECT CASE WHEN COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE visitor_feedback='helpful') * 100.0
        / COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL),1) END FROM a),
  'unhelpful_pct', (SELECT CASE WHEN COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE visitor_feedback='not_helpful') * 100.0
        / COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL),1) END FROM a),
  'rated', (SELECT COUNT(*) FROM a WHERE visitor_feedback IS NOT NULL),
  'escalations_by_department', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(d.name,'Unassigned') AS department, COUNT(*) AS n
      FROM c LEFT JOIN public.departments d ON d.id = c.department_id
      WHERE c.escalation_requested GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'top_questions', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT left(question, 140) AS question, COUNT(*) AS n
      FROM a GROUP BY 1 ORDER BY 2 DESC LIMIT 15) x), '[]'::jsonb),
  'low_confidence_questions', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT left(question, 140) AS question, ROUND(AVG(confidence)::numeric,2) AS confidence, COUNT(*) AS n
      FROM a WHERE confidence IS NOT NULL AND confidence < 0.5
      GROUP BY 1 ORDER BY 3 DESC LIMIT 15) x), '[]'::jsonb)
)
$$;

-- Intake -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_intake(
  _org uuid, _from timestamptz, _to timestamptz,
  _dept uuid[] DEFAULT NULL, _staff uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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
      GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_staff', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(p.full_name,'Unassigned') AS staff, COUNT(*) AS n,
        COUNT(*) FILTER (WHERE i.stage::text='approved') AS approved
      FROM i LEFT JOIN public.profiles p ON p.id = i.assigned_to
      GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_service', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(service_interest,'Not stated') AS service, COUNT(*) AS n
      FROM i GROUP BY 1 ORDER BY 2 DESC LIMIT 20) x), '[]'::jsonb),
  'by_county', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(county,'Not stated') AS county, COUNT(*) AS n
      FROM i GROUP BY 1 ORDER BY 2 DESC LIMIT 20) x), '[]'::jsonb),
  'by_health_plan', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(health_plan,'Not stated') AS health_plan, COUNT(*) AS n
      FROM i GROUP BY 1 ORDER BY 2 DESC LIMIT 20) x), '[]'::jsonb),
  'rows', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT i.id, i.reference, i.created_at, i.request_type::text AS request_type, i.stage::text AS stage,
             i.full_name, i.service_interest, i.county, i.health_plan,
             d.name AS department, p.full_name AS assigned_name
      FROM i LEFT JOIN public.departments d ON d.id = i.department_id
      LEFT JOIN public.profiles p ON p.id = i.assigned_to
      ORDER BY i.created_at DESC LIMIT 200) x), '[]'::jsonb)
)
$$;

REVOKE ALL ON FUNCTION public.report_tickets(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer,text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_transfers(uuid,timestamptz,timestamptz,uuid[],integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_sla(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_volume(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_ai(uuid,timestamptz,timestamptz,uuid[],uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_intake(uuid,timestamptz,timestamptz,uuid[],uuid[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.report_tickets(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer,text,text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_transfers(uuid,timestamptz,timestamptz,uuid[],integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_sla(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_volume(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_ai(uuid,timestamptz,timestamptz,uuid[],uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_intake(uuid,timestamptz,timestamptz,uuid[],uuid[]) TO service_role;