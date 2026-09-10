-- 1. Satisfaction on the 1-5 scale, like every other screen.
CREATE OR REPLACE FUNCTION public.quality_summary(_org uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'ratings_total', (SELECT count(*) FROM public.conversation_ratings r WHERE r.organization_id = _org),
    'csat', (
      SELECT round(avg(r.score)::numeric, 1)
      FROM public.conversation_ratings r WHERE r.organization_id = _org
    ),
    'positive_rate', (
      SELECT round(100.0 * count(*) FILTER (WHERE r.score >= 4) / NULLIF(count(*), 0))
      FROM public.conversation_ratings r WHERE r.organization_id = _org
    ),
    'reviews_total', (SELECT count(*) FROM public.qa_reviews q WHERE q.organization_id = _org),
    'avg_qa', (
      SELECT round(avg(q.overall_score)::numeric, 1)
      FROM public.qa_reviews q WHERE q.organization_id = _org
    ),
    'flagged_total', (
      SELECT count(*) FROM public.qa_reviews q WHERE q.organization_id = _org AND q.flagged
    )
  )
  WHERE public.can_access_org(_org);
$function$;

-- 2. Staff numbers credited to the person who did the work, from the event log.
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
-- Who claimed each conversation, and when: the first 'claimed' event wins,
-- falling back to the current owner for history recorded before events existed.
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
-- The first agent who actually replied owns the response time and the reply
-- target, whoever the conversation belongs to today.
), responder AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id, m.sender_user_id AS user_id, m.created_at AS replied_at
  FROM public.messages m
  WHERE m.organization_id = _org AND m.sender_type = 'agent' AND m.sender_user_id IS NOT NULL
    AND m.conversation_id IN (SELECT id FROM c)
  ORDER BY m.conversation_id, m.created_at
), responses AS (
  SELECT r.user_id,
    ROUND(AVG(EXTRACT(EPOCH FROM (r.replied_at - c.queue_at))/60)::numeric,1) AS avg_response,
    COUNT(*) FILTER (WHERE c.escalation_requested) AS sla_eligible,
    COUNT(*) FILTER (WHERE c.escalation_requested
      AND EXTRACT(EPOCH FROM (r.replied_at - c.queue_at))/60 <= _sla) AS sla_met
  FROM responder r JOIN c ON c.id = r.conversation_id
  GROUP BY r.user_id
-- Handling time and the visitor's rating belong to whoever finished the job.
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
-- A transfer counts against the person who initiated it.
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
