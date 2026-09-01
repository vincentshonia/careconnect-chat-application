-- Lock down the trigger helpers added in the previous migration
REVOKE ALL ON FUNCTION public.track_conversation_event_counters() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.track_message_activity() FROM PUBLIC, anon, authenticated;

-- Shared filtered conversation set --------------------------------------------
CREATE OR REPLACE FUNCTION public.report_conv(
  _org uuid,
  _from timestamptz,
  _to timestamptz,
  _dept uuid[] DEFAULT NULL,
  _staff uuid[] DEFAULT NULL,
  _statuses text[] DEFAULT NULL,
  _website uuid DEFAULT NULL,
  _type text DEFAULT NULL,
  _transfer text DEFAULT NULL,
  _priority text DEFAULT NULL
)
RETURNS SETOF public.conversations
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.* FROM public.conversations c
  WHERE c.organization_id = _org
    AND c.created_at >= _from AND c.created_at < _to
    AND (_dept IS NULL OR c.department_id = ANY(_dept))
    AND (_staff IS NULL OR c.assigned_to = ANY(_staff))
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
$$;

-- Overview ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_overview(
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
), snap AS (
  SELECT
    COUNT(*) FILTER (WHERE status::text IN ('new','waiting','escalated','follow_up') AND assigned_to IS NULL) AS waiting_now,
    COUNT(*) FILTER (WHERE status::text IN ('assigned','active')) AS active_now,
    COUNT(*) FILTER (WHERE status::text NOT IN ('resolved','closed','archived','spam')) AS open_now,
    COUNT(*) FILTER (WHERE assigned_to IS NULL AND status::text NOT IN ('resolved','closed','archived','spam')) AS unassigned_now,
    COUNT(*) FILTER (WHERE first_agent_response_at IS NULL AND escalation_requested
      AND COALESCE(first_human_requested_at, requested_agent_at, created_at) < now() - make_interval(mins => _sla)) AS breaching_now,
    MIN(COALESCE(first_human_requested_at, requested_agent_at, created_at)) FILTER (WHERE assigned_to IS NULL AND status::text IN ('new','waiting','escalated','follow_up')) AS oldest_waiting
  FROM public.conversations
  WHERE organization_id = _org
    AND (_dept IS NULL OR department_id = ANY(_dept))
    AND (_staff IS NULL OR assigned_to = ANY(_staff))
)
SELECT jsonb_build_object(
  'kpis', (SELECT jsonb_build_object(
    'total', COUNT(*),
    'open', COUNT(*) FILTER (WHERE status::text IN ('new','waiting','assigned','active','pending_visitor','pending_internal','follow_up','escalated')),
    'waiting', COUNT(*) FILTER (WHERE assigned_to IS NULL AND status::text IN ('new','waiting','escalated','follow_up')),
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
    'abandoned', COUNT(*) FILTER (WHERE escalation_requested AND claimed_at IS NULL AND status::text IN ('closed','archived'))
  ) FROM t),
  'transfer_events', (SELECT transfer_events FROM ev),
  'csat', (SELECT ROUND(csat, 2) FROM rate),
  'csat_responses', (SELECT rated FROM rate),
  'funnel', (SELECT jsonb_build_object(
    'created', COUNT(*),
    'ai_handled', COUNT(*) FILTER (WHERE NOT escalation_requested),
    'human_requested', COUNT(*) FILTER (WHERE escalation_requested),
    'waiting', COUNT(*) FILTER (WHERE escalation_requested AND claimed_at IS NULL),
    'claimed', COUNT(*) FILTER (WHERE claimed_at IS NOT NULL),
    'responded', COUNT(*) FILTER (WHERE first_agent_response_at IS NOT NULL),
    'resolved', COUNT(*) FILTER (WHERE status::text = 'resolved'),
    'closed', COUNT(*) FILTER (WHERE status::text = 'closed')
  ) FROM t),
  'snapshot', (SELECT to_jsonb(snap) FROM snap)
)
$$;

-- Department performance --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_departments(
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
), agg AS (
  SELECT
    c.department_id,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE c.status::text = 'new') AS new_count,
    COUNT(*) FILTER (WHERE c.status::text IN ('new','waiting','assigned','active','pending_visitor','pending_internal','follow_up','escalated')) AS open_count,
    COUNT(*) FILTER (WHERE c.assigned_to IS NULL AND c.status::text IN ('new','waiting','escalated','follow_up')) AS waiting,
    COUNT(*) FILTER (WHERE c.status::text IN ('assigned','active')) AS active,
    COUNT(*) FILTER (WHERE c.status::text = 'resolved') AS resolved,
    COUNT(*) FILTER (WHERE c.status::text = 'closed') AS closed,
    COUNT(*) FILTER (WHERE COALESCE(c.transfer_count,0) > 0) AS transferred,
    COUNT(*) FILTER (WHERE c.escalation_requested) AS escalated,
    ROUND(AVG(EXTRACT(EPOCH FROM (c.first_agent_response_at - c.queue_at))/60)::numeric, 1) AS avg_first_response,
    ROUND(AVG(EXTRACT(EPOCH FROM (c.claimed_at - c.queue_at))/60)::numeric, 1) AS avg_claim,
    ROUND(AVG(EXTRACT(EPOCH FROM (c.done_at - c.created_at))/60)::numeric, 1) AS avg_resolution,
    COUNT(*) FILTER (WHERE c.escalation_requested) AS sla_eligible,
    COUNT(*) FILTER (WHERE c.escalation_requested AND c.first_agent_response_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (c.first_agent_response_at - c.queue_at))/60 <= _sla) AS sla_met
  FROM c GROUP BY c.department_id
), csat AS (
  SELECT c.department_id, ROUND(AVG(r.score)::numeric,2) AS csat
  FROM c JOIN public.conversation_ratings r ON r.conversation_id = c.id
  GROUP BY c.department_id
), tin AS (
  SELECT e.new_value::uuid AS department_id, COUNT(*) AS n
  FROM public.conversation_events e
  WHERE e.event_type='transferred' AND e.organization_id = _org
    AND e.created_at >= _from AND e.created_at < _to AND e.new_value IS NOT NULL
  GROUP BY 1
), tout AS (
  SELECT e.previous_value::uuid AS department_id, COUNT(*) AS n
  FROM public.conversation_events e
  WHERE e.event_type='transferred' AND e.organization_id = _org
    AND e.created_at >= _from AND e.created_at < _to AND e.previous_value IS NOT NULL
  GROUP BY 1
)
SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'total')::int DESC), '[]'::jsonb) FROM (
  SELECT jsonb_build_object(
    'department_id', a.department_id,
    'department_name', COALESCE(d.name, 'Unassigned'),
    'total', a.total, 'new_count', a.new_count, 'open_count', a.open_count,
    'waiting', a.waiting, 'active', a.active, 'resolved', a.resolved, 'closed', a.closed,
    'completed', a.resolved + a.closed,
    'transferred', a.transferred, 'escalated', a.escalated,
    'transfers_in', COALESCE(ti.n, 0), 'transfers_out', COALESCE(tou.n, 0),
    'avg_first_response', a.avg_first_response, 'avg_claim', a.avg_claim,
    'avg_resolution', a.avg_resolution,
    'sla_pct', CASE WHEN a.sla_eligible > 0 THEN ROUND(a.sla_met * 100.0 / a.sla_eligible, 1) END,
    'csat', s.csat
  ) AS row
  FROM agg a
  LEFT JOIN public.departments d ON d.id = a.department_id
  LEFT JOIN csat s ON s.department_id IS NOT DISTINCT FROM a.department_id
  LEFT JOIN tin ti ON ti.department_id = a.department_id
  LEFT JOIN tout tou ON tou.department_id = a.department_id
) x
$$;

-- Current backlog by department (real time, ignores the period) ------------------
CREATE OR REPLACE FUNCTION public.report_department_backlog(
  _org uuid, _dept uuid[] DEFAULT NULL, _sla integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'waiting')::int DESC, (row->>'open')::int DESC), '[]'::jsonb) FROM (
  SELECT jsonb_build_object(
    'department_id', c.department_id,
    'department_name', COALESCE(d.name, 'Unassigned'),
    'waiting', COUNT(*) FILTER (WHERE c.assigned_to IS NULL AND c.status::text IN ('new','waiting','escalated','follow_up')),
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
  FROM public.conversations c
  LEFT JOIN public.departments d ON d.id = c.department_id
  WHERE c.organization_id = _org
    AND c.status::text NOT IN ('resolved','closed','archived','spam')
    AND (_dept IS NULL OR c.department_id = ANY(_dept))
  GROUP BY c.department_id, d.name
) x
$$;

-- Staff performance -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_staff(
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
WITH people AS (
  SELECT m.user_id, p.full_name, p.presence, p.max_concurrent_chats
  FROM public.organization_memberships m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.organization_id = _org AND m.status = 'active'
    AND (_staff IS NULL OR m.user_id = ANY(_staff))
    AND (_dept IS NULL OR EXISTS (
      SELECT 1 FROM public.department_members dm
      WHERE dm.user_id = m.user_id AND dm.department_id = ANY(_dept)))
), c AS (
  SELECT *,
    COALESCE(first_human_requested_at, requested_agent_at, created_at) AS queue_at,
    COALESCE(resolved_at, closed_at) AS done_at
  FROM public.report_conv(_org,_from,_to,_dept,_staff,_statuses,_website,_type,_transfer,_priority)
), owned AS (
  SELECT c.assigned_to AS user_id,
    COUNT(*) AS assigned_count,
    COUNT(*) FILTER (WHERE c.status::text IN ('new','waiting','assigned','active','pending_visitor','pending_internal','follow_up','escalated')) AS open_count,
    COUNT(*) FILTER (WHERE c.status::text IN ('assigned','active')) AS active_count,
    COUNT(*) FILTER (WHERE COALESCE(c.transfer_count,0) > 0) AS transferred,
    ROUND(AVG(EXTRACT(EPOCH FROM (c.first_agent_response_at - c.queue_at))/60)::numeric,1) AS avg_response,
    ROUND(AVG(EXTRACT(EPOCH FROM (c.done_at - c.claimed_at))/60)::numeric,1) AS avg_handle,
    ROUND(AVG(EXTRACT(EPOCH FROM (c.done_at - c.created_at))/60)::numeric,1) AS avg_resolution,
    ROUND(AVG(EXTRACT(EPOCH FROM (c.claimed_at - c.queue_at))/60)::numeric,1) AS avg_claim,
    COUNT(*) FILTER (WHERE c.escalation_requested) AS sla_eligible,
    COUNT(*) FILTER (WHERE c.escalation_requested AND c.first_agent_response_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (c.first_agent_response_at - c.queue_at))/60 <= _sla) AS sla_met
  FROM c WHERE c.assigned_to IS NOT NULL GROUP BY c.assigned_to
), credited AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE kind = 'resolved') AS resolved_count,
    COUNT(*) FILTER (WHERE kind = 'closed') AS closed_count
  FROM (
    SELECT COALESCE(resolved_by, assigned_to) AS user_id, 'resolved'::text AS kind FROM c WHERE status::text='resolved'
    UNION ALL
    SELECT COALESCE(closed_by, assigned_to) AS user_id, 'closed'::text AS kind FROM c WHERE status::text='closed'
  ) z WHERE user_id IS NOT NULL GROUP BY user_id
), ev AS (
  SELECT e.actor_id AS user_id,
    COUNT(*) FILTER (WHERE e.event_type='claimed') AS claimed,
    COUNT(*) FILTER (WHERE e.event_type='transferred') AS transfers_initiated,
    COUNT(*) FILTER (WHERE e.event_type='reassigned') AS reassignments
  FROM public.conversation_events e
  WHERE e.organization_id = _org AND e.created_at >= _from AND e.created_at < _to
  GROUP BY e.actor_id
), msgs AS (
  SELECT sender_user_id AS user_id, COUNT(*) AS messages_sent
  FROM public.messages
  WHERE organization_id = _org AND sender_type='agent'
    AND created_at >= _from AND created_at < _to AND sender_user_id IS NOT NULL
  GROUP BY sender_user_id
), csat AS (
  SELECT c.assigned_to AS user_id, ROUND(AVG(r.score)::numeric,2) AS csat
  FROM c JOIN public.conversation_ratings r ON r.conversation_id = c.id
  WHERE c.assigned_to IS NOT NULL GROUP BY c.assigned_to
), live AS (
  SELECT assigned_to AS user_id, COUNT(*) AS live_open
  FROM public.conversations
  WHERE organization_id = _org AND assigned_to IS NOT NULL
    AND status::text IN ('assigned','active','pending_visitor','pending_internal','follow_up','escalated')
  GROUP BY assigned_to
), depts AS (
  SELECT dm.user_id, string_agg(d.name, ', ' ORDER BY d.name) AS department_names
  FROM public.department_members dm JOIN public.departments d ON d.id = dm.department_id
  WHERE dm.organization_id = _org GROUP BY dm.user_id
)
SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'assigned_count')::int DESC NULLS LAST), '[]'::jsonb) FROM (
  SELECT jsonb_build_object(
    'user_id', p.user_id,
    'full_name', COALESCE(p.full_name, 'Unnamed'),
    'presence', p.presence,
    'departments', COALESCE(dp.department_names, '—'),
    'claimed', COALESCE(e.claimed, 0),
    'assigned_count', COALESCE(o.assigned_count, 0),
    'open_count', COALESCE(o.open_count, 0),
    'active_count', COALESCE(o.active_count, 0),
    'live_open', COALESCE(l.live_open, 0),
    'max_chats', p.max_concurrent_chats,
    'resolved', COALESCE(cr.resolved_count, 0),
    'closed', COALESCE(cr.closed_count, 0),
    'completed', COALESCE(cr.resolved_count,0) + COALESCE(cr.closed_count,0),
    'transferred', COALESCE(o.transferred, 0),
    'transfers_initiated', COALESCE(e.transfers_initiated, 0),
    'reassignments', COALESCE(e.reassignments, 0),
    'messages_sent', COALESCE(mm.messages_sent, 0),
    'avg_response', o.avg_response,
    'avg_claim', o.avg_claim,
    'avg_handle', o.avg_handle,
    'avg_resolution', o.avg_resolution,
    'sla_pct', CASE WHEN COALESCE(o.sla_eligible,0) > 0 THEN ROUND(o.sla_met * 100.0 / o.sla_eligible, 1) END,
    'csat', s.csat
  ) AS row
  FROM people p
  LEFT JOIN owned o ON o.user_id = p.user_id
  LEFT JOIN credited cr ON cr.user_id = p.user_id
  LEFT JOIN ev e ON e.user_id = p.user_id
  LEFT JOIN msgs mm ON mm.user_id = p.user_id
  LEFT JOIN csat s ON s.user_id = p.user_id
  LEFT JOIN live l ON l.user_id = p.user_id
  LEFT JOIN depts dp ON dp.user_id = p.user_id
) x
$$;

-- Current agent workload (real time) --------------------------------------------
CREATE OR REPLACE FUNCTION public.report_staff_workload(_org uuid, _dept uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    SELECT assigned_to, COUNT(*) AS n FROM public.conversations
    WHERE organization_id = _org AND assigned_to IS NOT NULL
      AND status::text IN ('assigned','active','pending_visitor','pending_internal','follow_up','escalated')
    GROUP BY assigned_to
  ) o ON o.assigned_to = p.id
  WHERE m.organization_id = _org AND m.status = 'active' AND p.status = 'active'
    AND (_dept IS NULL OR EXISTS (SELECT 1 FROM public.department_members dm
        WHERE dm.user_id = p.id AND dm.department_id = ANY(_dept)))
) x
$$;

REVOKE ALL ON FUNCTION public.report_conv(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_overview(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_departments(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_department_backlog(uuid,uuid[],integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_staff(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.report_staff_workload(uuid,uuid[]) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.report_conv(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_overview(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_departments(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_department_backlog(uuid,uuid[],integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_staff(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_staff_workload(uuid,uuid[]) TO service_role;