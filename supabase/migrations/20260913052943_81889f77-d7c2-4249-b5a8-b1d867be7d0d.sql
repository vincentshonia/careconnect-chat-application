-- Reporting must never count preview chats. These five functions still read
-- public.conversations directly, bypassing the rpt.conversations view that
-- filters is_preview = false.

CREATE OR REPLACE FUNCTION public.report_conv(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text)
 RETURNS SETOF public.conversations
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'rpt', 'public'
AS $function$
  SELECT c.* FROM rpt.conversations c
  WHERE c.organization_id = _org
    AND c.created_at >= _from AND c.created_at < _to
    AND (_dept IS NULL OR c.department_id = ANY(_dept))
    AND (_staff IS NULL OR c.assigned_to = ANY(_staff) OR EXISTS (
      SELECT 1 FROM public.conversation_events e
      WHERE e.conversation_id = c.id
        AND e.actor_id = ANY(_staff)
        AND e.event_type IN ('claimed','agent_reply','resolved','closed','transferred','reassigned')))
    AND (_statuses IS NULL OR c.status::text = ANY(_statuses))
    AND (_website IS NULL OR c.website_id = _website)
    AND (_priority IS NULL OR c.priority::text = _priority)
    AND (_type IS NULL OR _type = 'all'
      OR (_type = 'ai_only' AND c.is_ai_only AND NOT c.escalation_requested)
      OR (_type = 'human' AND NOT c.is_ai_only)
      OR (_type = 'escalated' AND c.escalation_requested))
    AND (_transfer IS NULL OR _transfer = 'all'
      OR (_transfer = 'never' AND COALESCE(c.transfer_count,0) = 0)
      OR (_transfer = 'once' AND COALESCE(c.transfer_count,0) = 1)
      OR (_transfer = 'multi' AND COALESCE(c.transfer_count,0) > 1))
$function$;

CREATE OR REPLACE FUNCTION public.report_ai(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _website uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'rpt', 'public'
AS $function$
WITH c AS (
  SELECT * FROM rpt.conversations
  WHERE organization_id=_org AND created_at >= _from AND created_at < _to
    AND (_dept IS NULL OR department_id = ANY(_dept))
    AND (_website IS NULL OR website_id = _website)
), a AS (
  SELECT r.* FROM public.ai_responses r
  JOIN c ON c.id = r.conversation_id
  WHERE r.organization_id = _org
), answered AS (
  SELECT c.* FROM c WHERE EXISTS (SELECT 1 FROM a WHERE a.conversation_id = c.id)
), eligible AS (
  SELECT e.*,
    public.conversation_human_touched(e.id) AS human_touched,
    (e.status::text IN ('resolved','closed')
      AND COALESCE(e.resolved_at, e.closed_at) IS NOT NULL) AS completed
  FROM answered e
  WHERE e.status::text NOT IN ('spam','archived','abandoned')
)
SELECT jsonb_build_object(
  'conversations', (SELECT COUNT(*) FROM c),
  'ai_answers', (SELECT COUNT(*) FROM a),
  'answered_conversations', (SELECT COUNT(*) FROM answered),
  'eligible', (SELECT COUNT(*) FROM eligible),
  'ai_only_completed', (SELECT COUNT(*) FROM eligible WHERE NOT human_touched AND completed),
  'ai_only_completion_rate', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(
      COUNT(*) FILTER (WHERE NOT human_touched AND completed) * 100.0 / COUNT(*), 1) END FROM eligible),
  'ai_unresolved', (SELECT COUNT(*) FROM eligible WHERE NOT human_touched AND NOT completed),
  'escalated', (SELECT COUNT(*) FROM eligible WHERE human_touched),
  'escalation_rate', (SELECT CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE human_touched) * 100.0 / COUNT(*), 1) END FROM eligible),
  'excluded', (SELECT COUNT(*) FROM answered WHERE status::text IN ('spam','archived','abandoned')),
  'avg_confidence', (SELECT ROUND(AVG(confidence)::numeric,2) FROM a),
  'low_confidence', (SELECT COUNT(*) FROM a WHERE confidence IS NOT NULL AND confidence < 0.5),
  'rated', (SELECT COUNT(*) FROM a WHERE visitor_feedback IS NOT NULL),
  'helpful', (SELECT COUNT(*) FROM a WHERE visitor_feedback = 'helpful'),
  'not_helpful', (SELECT COUNT(*) FROM a WHERE visitor_feedback = 'not_helpful'),
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
$function$;

CREATE OR REPLACE FUNCTION public.report_department_backlog(_org uuid, _dept uuid[] DEFAULT NULL::uuid[], _sla integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'rpt', 'public'
AS $function$
SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'waiting')::int DESC, (row->>'open')::int DESC), '[]'::jsonb) FROM (
  SELECT jsonb_build_object(
    'department_id', c.department_id,
    'department_name', COALESCE(d.name, 'Unassigned'),
    'waiting', COUNT(*) FILTER (WHERE c.escalation_requested AND c.assigned_to IS NULL AND c.status::text IN ('waiting','escalated','follow_up')),
    'assigned', COUNT(*) FILTER (WHERE c.status::text = 'assigned'),
    'active', COUNT(*) FILTER (WHERE c.status::text = 'active'),
    'follow_up', COUNT(*) FILTER (WHERE c.status::text = 'follow_up'),
    'pending_visitor', COUNT(*) FILTER (WHERE c.status::text = 'pending_visitor'),
    'pending_internal', COUNT(*) FILTER (WHERE c.status::text = 'pending_internal'),
    'open', COUNT(*),
    'breaching', COUNT(*) FILTER (WHERE c.first_agent_response_at IS NULL AND c.escalation_requested
      AND COALESCE(c.first_human_requested_at, c.requested_agent_at, c.created_at) < now() - make_interval(mins => _sla)),
    'aged_24h', COUNT(*) FILTER (WHERE c.created_at < now() - interval '24 hours'),
    'oldest_open_at', MIN(c.created_at)
  ) AS row
  FROM rpt.conversations c
  LEFT JOIN public.departments d ON d.id = c.department_id
  WHERE c.organization_id = _org
    AND c.status::text NOT IN ('resolved','closed','archived','spam','abandoned')
    AND (_dept IS NULL OR c.department_id = ANY(_dept))
  GROUP BY c.department_id, d.name
) x
$function$;

CREATE OR REPLACE FUNCTION public.report_staff_workload(_org uuid, _dept uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'rpt', 'public'
AS $function$
SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'utilisation')::numeric DESC NULLS LAST), '[]'::jsonb) FROM (
  SELECT jsonb_build_object(
    'user_id', p.id,
    'full_name', COALESCE(p.full_name,'Unnamed'),
    'presence', p.presence,
    'departments', COALESCE((SELECT string_agg(d.name, ', ' ORDER BY d.name)
       FROM public.department_members dm JOIN public.departments d ON d.id = dm.department_id
       WHERE dm.user_id = p.id AND dm.organization_id = _org), '—'),
    'open_chats', COALESCE(o.n, 0),
    'max_chats', p.max_concurrent_chats,
    'utilisation', CASE WHEN p.max_concurrent_chats > 0
      THEN ROUND(COALESCE(o.n,0) * 100.0 / p.max_concurrent_chats, 0) ELSE NULL END
  ) AS row
  FROM public.organization_memberships m
  JOIN public.profiles p ON p.id = m.user_id
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) AS n FROM rpt.conversations
    WHERE organization_id = _org AND assigned_to IS NOT NULL
      AND status::text IN ('assigned','active','pending_visitor','pending_internal','follow_up','escalated')
    GROUP BY assigned_to
  ) o ON o.assigned_to = p.id
  WHERE m.organization_id = _org AND m.status = 'active' AND p.status = 'active'
    AND (_dept IS NULL OR EXISTS (SELECT 1 FROM public.department_members dm
        WHERE dm.user_id = p.id AND dm.department_id = ANY(_dept)))
) x
$function$;

CREATE OR REPLACE FUNCTION public.report_transfers(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _limit integer DEFAULT 50, _offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'rpt', 'public'
AS $function$
WITH e AS (
  SELECT ev.*, c.reference, c.status, c.department_id AS final_department_id, c.assigned_to AS final_agent_id
  FROM public.conversation_events ev
  JOIN rpt.conversations c ON c.id = ev.conversation_id
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
  SELECT COUNT(*) AS total FROM rpt.conversations
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
$function$;

CREATE OR REPLACE FUNCTION public.report_overview(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _sla integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'rpt', 'public'
AS $function$
WITH c AS (
  SELECT * FROM public.report_conv(_org,_from,_to,_dept,_staff,_statuses,_website,_type,_transfer,_priority)
), m AS (
  SELECT
    c.*,
    COALESCE(c.first_human_requested_at, c.requested_agent_at, c.created_at) AS queue_at,
    COALESCE(c.resolved_at, c.closed_at) AS done_at
  FROM c
), t AS (
  SELECT
    m.*,
    EXTRACT(EPOCH FROM (m.claimed_at - m.queue_at))/60 AS claim_min,
    EXTRACT(EPOCH FROM (m.first_agent_response_at - m.queue_at))/60 AS resp_min,
    EXTRACT(EPOCH FROM (m.done_at - m.claimed_at))/60 AS handle_min,
    EXTRACT(EPOCH FROM (m.done_at - m.created_at))/60 AS res_min
  FROM m
), rate AS (
  SELECT AVG(r.score)::numeric AS csat, COUNT(*) AS rated
  FROM public.conversation_ratings r WHERE r.conversation_id IN (SELECT id FROM c)
), ev AS (
  SELECT COUNT(*) AS transfer_events
  FROM public.conversation_events e
  WHERE e.event_type = 'transferred' AND e.conversation_id IN (SELECT id FROM c)
), outc AS (
  SELECT COALESCE(d.label, 'Not recorded') AS label, COUNT(*) AS conversations
  FROM c
  LEFT JOIN public.conversation_dispositions d ON d.id = c.disposition_id
  WHERE c.status::text IN ('resolved','closed')
  GROUP BY 1
), snap AS (
  SELECT
    COUNT(*) FILTER (WHERE escalation_requested AND assigned_to IS NULL AND status::text IN ('waiting','escalated','follow_up')) AS waiting_now,
    COUNT(*) FILTER (WHERE status::text IN ('assigned','active')) AS active_now,
    COUNT(*) FILTER (WHERE status::text NOT IN ('resolved','closed','archived','spam','abandoned')) AS open_now,
    COUNT(*) FILTER (WHERE assigned_to IS NULL AND status::text NOT IN ('resolved','closed','archived','spam','abandoned')) AS unassigned_now,
    COUNT(*) FILTER (WHERE first_agent_response_at IS NULL AND escalation_requested
      AND status::text IN ('waiting','escalated','assigned','active','follow_up','pending_visitor','pending_internal')
      AND COALESCE(first_human_requested_at, requested_agent_at, created_at) < now() - make_interval(mins => _sla)) AS breaching_now,
    MIN(COALESCE(first_human_requested_at, requested_agent_at, created_at)) FILTER (WHERE escalation_requested AND assigned_to IS NULL AND status::text IN ('waiting','escalated','follow_up')) AS oldest_waiting
  FROM rpt.conversations
  WHERE organization_id = _org
    AND (_dept IS NULL OR department_id = ANY(_dept))
    AND (_staff IS NULL OR assigned_to = ANY(_staff))
)
SELECT jsonb_build_object(
  'kpis', (SELECT jsonb_build_object(
    'total', COUNT(*),
    'open', COUNT(*) FILTER (WHERE status::text IN ('new','waiting','assigned','active','pending_visitor','pending_internal','follow_up','escalated')),
    'waiting', COUNT(*) FILTER (WHERE escalation_requested AND assigned_to IS NULL AND status::text IN ('waiting','escalated','follow_up')),
    'active', COUNT(*) FILTER (WHERE status::text IN ('assigned','active')),
    'resolved', COUNT(*) FILTER (WHERE status::text = 'resolved'),
    'closed', COUNT(*) FILTER (WHERE status::text = 'closed'),
    'completed', COUNT(*) FILTER (WHERE status::text IN ('resolved','closed')),
    'escalated', COUNT(*) FILTER (WHERE escalation_requested),
    'transferred', COUNT(*) FILTER (WHERE COALESCE(transfer_count,0) > 0),
    'multi_transferred', COUNT(*) FILTER (WHERE COALESCE(transfer_count,0) > 1),
    'reopened', COUNT(*) FILTER (WHERE COALESCE(reopened_count,0) > 0),
    'avg_first_response', ROUND(AVG(resp_min)::numeric, 1),
    'avg_wait_to_claim', ROUND(AVG(claim_min)::numeric, 1),
    'avg_handle', ROUND(AVG(handle_min)::numeric, 1),
    'avg_resolution', ROUND(AVG(res_min)::numeric, 1),
    'sla_eligible', COUNT(*) FILTER (WHERE escalation_requested),
    'sla_met', COUNT(*) FILTER (WHERE escalation_requested AND resp_min IS NOT NULL AND resp_min <= _sla),
    'unanswered', COUNT(*) FILTER (WHERE escalation_requested AND first_agent_response_at IS NULL),
    'unclaimed_escalations', COUNT(*) FILTER (WHERE escalation_requested AND claimed_at IS NULL),
    'abandoned', COUNT(*) FILTER (WHERE escalation_requested AND first_agent_response_at IS NULL AND status::text IN ('closed','abandoned'))
  ) FROM t),
  'transfer_events', (SELECT transfer_events FROM ev),
  'csat', (SELECT ROUND(csat, 2) FROM rate),
  'csat_responses', (SELECT rated FROM rate),
  'outcomes', COALESCE((SELECT jsonb_agg(jsonb_build_object('label', label, 'conversations', conversations) ORDER BY conversations DESC, label) FROM outc), '[]'::jsonb),
  'funnel', (SELECT jsonb_build_object(
    'created', COUNT(*),
    'ai_handled', COUNT(*) FILTER (WHERE NOT escalation_requested AND status::text <> 'abandoned'),
    'human_requested', COUNT(*) FILTER (WHERE escalation_requested),
    'waiting', COUNT(*) FILTER (WHERE escalation_requested AND claimed_at IS NULL),
    'claimed', COUNT(*) FILTER (WHERE claimed_at IS NOT NULL),
    'responded', COUNT(*) FILTER (WHERE first_agent_response_at IS NOT NULL),
    'resolved', COUNT(*) FILTER (WHERE status::text = 'resolved'),
    'closed', COUNT(*) FILTER (WHERE status::text = 'closed')
  ) FROM t),
  'snapshot', (SELECT to_jsonb(snap) FROM snap)
)
$function$;