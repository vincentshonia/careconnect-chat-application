CREATE INDEX IF NOT EXISTS conversation_events_actor_type_created_idx
  ON public.conversation_events (actor_id, event_type, created_at);

-- 1. report_conv: staff filter matches worked-on conversations, not just current owner
CREATE OR REPLACE FUNCTION public.report_conv(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text)
 RETURNS SETOF conversations
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.* FROM public.conversations c
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

-- 2. report_staff: never-answered escalations count against the claimer
CREATE OR REPLACE FUNCTION public.report_staff(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _sla integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
), claimer AS (
  SELECT DISTINCT ON (e.conversation_id)
    e.conversation_id, e.actor_id AS user_id, e.created_at AS claimed_at
  FROM public.conversation_events e
  WHERE e.organization_id = _org AND e.event_type = 'claimed' AND e.actor_id IS NOT NULL
    AND e.conversation_id IN (SELECT id FROM c)
  ORDER BY e.conversation_id, e.created_at
), claim_credit AS (
  SELECT COALESCE(cl.user_id, c.assigned_to) AS user_id,
    c.id,
    COALESCE(cl.claimed_at, c.claimed_at) AS claimed_at,
    c.queue_at, c.done_at
  FROM c LEFT JOIN claimer cl ON cl.conversation_id = c.id
  WHERE COALESCE(cl.user_id, c.assigned_to) IS NOT NULL
), claims AS (
  SELECT user_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (claimed_at - queue_at))/60)::numeric,1) AS avg_claim
  FROM claim_credit WHERE claimed_at IS NOT NULL GROUP BY user_id
), responder AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id, m.sender_user_id AS user_id, m.created_at AS replied_at
  FROM public.messages m
  WHERE m.organization_id = _org AND m.sender_type = 'agent' AND m.sender_user_id IS NOT NULL
    AND m.conversation_id IN (SELECT id FROM c)
  ORDER BY m.conversation_id, m.created_at
-- Answered chats belong to the first replier; an escalation that was claimed
-- and never answered is a breach for the person who claimed it.
), resp_base AS (
  SELECT COALESCE(r.user_id, cc.user_id) AS user_id,
    r.replied_at, c.queue_at, c.escalation_requested
  FROM c
  LEFT JOIN responder r ON r.conversation_id = c.id
  LEFT JOIN claim_credit cc ON cc.id = c.id
  WHERE r.user_id IS NOT NULL OR (c.escalation_requested AND cc.user_id IS NOT NULL)
), responses AS (
  SELECT user_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (replied_at - queue_at))/60)::numeric,1) AS avg_response,
    COUNT(*) FILTER (WHERE escalation_requested) AS sla_eligible,
    COUNT(*) FILTER (WHERE escalation_requested AND replied_at IS NOT NULL
      AND EXTRACT(EPOCH FROM (replied_at - queue_at))/60 <= _sla) AS sla_met
  FROM resp_base WHERE user_id IS NOT NULL GROUP BY user_id
), resolver AS (
  SELECT c.id AS conversation_id,
    COALESCE(
      c.resolved_by,
      c.closed_by,
      (SELECT e.actor_id FROM public.conversation_events e
        WHERE e.conversation_id = c.id AND e.event_type IN ('resolved','closed')
          AND e.actor_id IS NOT NULL
        ORDER BY e.created_at DESC LIMIT 1)
    ) AS user_id,
    c.done_at,
    COALESCE((SELECT cl.claimed_at FROM claimer cl WHERE cl.conversation_id = c.id), c.claimed_at) AS claimed_at,
    c.created_at
  FROM c WHERE c.done_at IS NOT NULL
), handled AS (
  SELECT user_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (done_at - claimed_at))/60)::numeric,1) AS avg_handle,
    ROUND(AVG(EXTRACT(EPOCH FROM (done_at - created_at))/60)::numeric,1) AS avg_resolution
  FROM resolver WHERE user_id IS NOT NULL GROUP BY user_id
), csat AS (
  SELECT rs.user_id, ROUND(AVG(r.score)::numeric,2) AS csat
  FROM resolver rs JOIN public.conversation_ratings r ON r.conversation_id = rs.conversation_id
  WHERE rs.user_id IS NOT NULL GROUP BY rs.user_id
), transfers AS (
  SELECT e.actor_id AS user_id, COUNT(DISTINCT e.conversation_id) AS transferred
  FROM public.conversation_events e
  WHERE e.organization_id = _org AND e.event_type = 'transferred' AND e.actor_id IS NOT NULL
    AND e.conversation_id IN (SELECT id FROM c)
  GROUP BY e.actor_id
), owned AS (
  SELECT c.assigned_to AS user_id,
    COUNT(*) AS assigned_count,
    COUNT(*) FILTER (WHERE c.status::text IN ('new','waiting','assigned','active','pending_visitor','pending_internal','follow_up','escalated')) AS open_count,
    COUNT(*) FILTER (WHERE c.status::text IN ('assigned','active')) AS active_count
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
    'transferred', COALESCE(tr.transferred, 0),
    'transfers_initiated', COALESCE(e.transfers_initiated, 0),
    'reassignments', COALESCE(e.reassignments, 0),
    'messages_sent', COALESCE(mm.messages_sent, 0),
    'avg_response', rp.avg_response,
    'avg_claim', cm.avg_claim,
    'avg_handle', hd.avg_handle,
    'avg_resolution', hd.avg_resolution,
    'sla_pct', CASE WHEN COALESCE(rp.sla_eligible,0) > 0 THEN ROUND(rp.sla_met * 100.0 / rp.sla_eligible, 1) END,
    'csat', s.csat
  ) AS row
  FROM people p
  LEFT JOIN owned o ON o.user_id = p.user_id
  LEFT JOIN credited cr ON cr.user_id = p.user_id
  LEFT JOIN ev e ON e.user_id = p.user_id
  LEFT JOIN msgs mm ON mm.user_id = p.user_id
  LEFT JOIN csat s ON s.user_id = p.user_id
  LEFT JOIN claims cm ON cm.user_id = p.user_id
  LEFT JOIN responses rp ON rp.user_id = p.user_id
  LEFT JOIN handled hd ON hd.user_id = p.user_id
  LEFT JOIN transfers tr ON tr.user_id = p.user_id
  LEFT JOIN live l ON l.user_id = p.user_id
  LEFT JOIN depts dp ON dp.user_id = p.user_id
) x
$function$;

-- 3. report_sla.by_staff credits the first responder recorded in the event log
CREATE OR REPLACE FUNCTION public.report_sla(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _sla integer DEFAULT 15, _tz text DEFAULT 'America/Los_Angeles'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      FROM public.conversations WHERE organization_id=_org AND assigned_to IS NULL AND escalation_requested
        AND status::text IN ('waiting','escalated','follow_up')
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
      FROM t
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          (SELECT e.actor_id FROM public.conversation_events e
            WHERE e.conversation_id = t.id AND e.event_type = 'agent_reply' AND e.actor_id IS NOT NULL
            ORDER BY e.created_at LIMIT 1),
          (SELECT e.actor_id FROM public.conversation_events e
            WHERE e.conversation_id = t.id AND e.event_type = 'claimed' AND e.actor_id IS NOT NULL
            ORDER BY e.created_at LIMIT 1),
          t.assigned_to) AS credited_to
      ) cr ON true
      LEFT JOIN public.profiles p ON p.id = cr.credited_to
      WHERE cr.credited_to IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_day', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'day') FROM (
      SELECT jsonb_build_object(
        'day', to_char(date_trunc('day', t.created_at AT TIME ZONE _tz), 'YYYY-MM-DD'),
        'conversations', COUNT(*),
        'avg_response', ROUND(AVG(t.resp_min)::numeric,1),
        'breaches', COUNT(*) FILTER (WHERE t.escalation_requested AND (t.resp_min IS NULL OR t.resp_min > _sla))
      ) AS x FROM t GROUP BY date_trunc('day', t.created_at AT TIME ZONE _tz)) y), '[]'::jsonb),
  'by_hour', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'hour')::int) FROM (
      SELECT jsonb_build_object(
        'hour', EXTRACT(HOUR FROM t.created_at AT TIME ZONE _tz)::int,
        'conversations', COUNT(*),
        'avg_response', ROUND(AVG(t.resp_min)::numeric,1)
      ) AS x FROM t GROUP BY EXTRACT(HOUR FROM t.created_at AT TIME ZONE _tz)) y), '[]'::jsonb)
)
$function$;

-- 4. dashboard_staff_performance: same queue start as the reports
CREATE OR REPLACE FUNCTION public.dashboard_staff_performance(_org uuid, _user uuid, _from timestamp with time zone, _to timestamp with time zone, _sla integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH handled AS (
    SELECT DISTINCT conversation_id FROM (
      SELECT m.conversation_id FROM messages m
        WHERE m.organization_id = _org AND m.sender_user_id = _user
          AND m.created_at >= _from AND m.created_at < _to
      UNION ALL
      SELECT e.conversation_id FROM conversation_events e
        WHERE e.organization_id = _org AND e.actor_id = _user
          AND e.event_type IN ('claimed','agent_reply','resolved','closed','transferred','reassigned')
          AND e.created_at >= _from AND e.created_at < _to
    ) x
  ),
  ev AS (
    SELECT
      count(*) FILTER (WHERE event_type = 'claimed') AS claimed,
      count(*) FILTER (WHERE event_type = 'transferred') AS transfers,
      count(*) FILTER (WHERE event_type = 'reassigned') AS reassignments
    FROM conversation_events
    WHERE organization_id = _org AND actor_id = _user
      AND created_at >= _from AND created_at < _to
  ),
  comp AS (
    SELECT
      count(*) FILTER (WHERE c.resolved_by = _user AND c.resolved_at >= _from AND c.resolved_at < _to) AS resolved,
      count(*) FILTER (WHERE c.closed_by = _user AND c.closed_at >= _from AND c.closed_at < _to
                         AND (c.resolved_by IS DISTINCT FROM _user OR c.resolved_at IS NULL)) AS closed
    FROM conversations c WHERE c.organization_id = _org
  ),
  timing AS (
    SELECT
      round(avg(extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.requested_agent_at, c.created_at)))/60.0)::numeric, 2) AS avg_first_response,
      round((percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.requested_agent_at, c.created_at)))/60.0))::numeric, 2) AS median_first_response,
      round(avg(extract(epoch FROM (c.claimed_at - coalesce(c.first_human_requested_at, c.requested_agent_at, c.created_at)))/60.0)
        FILTER (WHERE c.claimed_at IS NOT NULL)::numeric, 2) AS avg_claim_time,
      count(*) FILTER (WHERE c.first_agent_response_at IS NOT NULL) AS responded,
      count(*) FILTER (WHERE c.first_agent_response_at IS NOT NULL
        AND c.first_agent_response_at - coalesce(c.first_human_requested_at, c.requested_agent_at, c.created_at) <= make_interval(mins => _sla)) AS in_sla
    FROM conversations c
    WHERE c.id IN (SELECT conversation_id FROM handled) AND c.first_agent_response_at IS NOT NULL
  ),
  handle AS (
    SELECT round(avg(extract(epoch FROM (coalesce(c.resolved_at, c.closed_at) - coalesce(c.claimed_at, c.created_at)))/60.0)::numeric, 2) AS avg_handle_time
    FROM conversations c
    WHERE c.organization_id = _org
      AND ((c.resolved_by = _user AND c.resolved_at >= _from AND c.resolved_at < _to)
        OR (c.closed_by = _user AND c.closed_at >= _from AND c.closed_at < _to))
  ),
  rating AS (
    SELECT round(avg(r.score)::numeric, 2) AS csat, count(*) AS csat_count
    FROM conversation_ratings r
    WHERE r.conversation_id IN (SELECT conversation_id FROM handled)
  )
  SELECT jsonb_build_object(
    'handled', (SELECT count(*) FROM handled),
    'claimed', ev.claimed,
    'transfers', ev.transfers,
    'reassignments', ev.reassignments,
    'resolved', comp.resolved,
    'closed', comp.closed,
    'completed', comp.resolved + comp.closed,
    'completion_rate', round(100.0 * (comp.resolved + comp.closed) / nullif((SELECT count(*) FROM handled), 0), 0),
    'avg_first_response', timing.avg_first_response,
    'median_first_response', timing.median_first_response,
    'avg_claim_time', timing.avg_claim_time,
    'avg_handle_time', handle.avg_handle_time,
    'sla_percent', round(100.0 * timing.in_sla / nullif(timing.responded, 0), 0),
    'csat', rating.csat,
    'csat_count', rating.csat_count
  )
  FROM ev, comp, timing, handle, rating;
$function$;

-- 5. conversation_events: server-side writes only
DROP POLICY IF EXISTS cev_insert ON public.conversation_events;
REVOKE INSERT ON public.conversation_events FROM authenticated;

-- 6. intake_events: stamp the acting user server-side
CREATE OR REPLACE FUNCTION public.stamp_intake_event_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.actor_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS intake_events_stamp_actor ON public.intake_events;
CREATE TRIGGER intake_events_stamp_actor
BEFORE INSERT ON public.intake_events
FOR EACH ROW EXECUTE FUNCTION public.stamp_intake_event_actor();

-- 7. knowledge_chunks: read-only for staff, writes via the indexer
DROP POLICY IF EXISTS kbch_write ON public.knowledge_chunks;
REVOKE INSERT, UPDATE, DELETE ON public.knowledge_chunks FROM authenticated;
CREATE POLICY kbch_read_editors ON public.knowledge_chunks FOR SELECT TO authenticated
  USING (public.has_perm(organization_id, 'knowledge.edit'));