-- report_sla: a finished, never-answered chat is no longer counted as a live
-- breach, matching report_overview.breaching_now. Answered-late chats still
-- count wherever they land. sla_met is unchanged.
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
), b AS (
  SELECT t.*,
    (t.escalation_requested AND (
       -- Still waiting on a first human reply, and the chat is still open.
       (EXTRACT(EPOCH FROM (t.first_agent_response_at - t.queue_at))/60 IS NULL
         AND t.status::text IN ('waiting','escalated','assigned','active','follow_up','pending_visitor','pending_internal'))
       -- Answered, but later than the target: a breach whatever happened next.
       OR EXTRACT(EPOCH FROM (t.first_agent_response_at - t.queue_at))/60 > _sla
    )) AS is_breach
  FROM t
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
      'breaches', COUNT(*) FILTER (WHERE is_breach)
    ) FROM b),
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
        ROUND(AVG(b.resp_min)::numeric,1) AS avg_response,
        ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY b.resp_min))::numeric,1) AS p90_response,
        COUNT(*) FILTER (WHERE b.is_breach) AS breaches
      FROM b LEFT JOIN public.departments d ON d.id = b.department_id
      GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_staff', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(p.full_name,'Unassigned') AS staff,
        COUNT(*) AS conversations,
        ROUND(AVG(b.resp_min)::numeric,1) AS avg_response,
        ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY b.resp_min))::numeric,1) AS p90_response,
        COUNT(*) FILTER (WHERE b.escalation_requested AND (b.resp_min IS NULL OR b.resp_min > _sla)) AS breaches
      FROM b
      LEFT JOIN LATERAL (
        SELECT COALESCE(
          (SELECT e.actor_id FROM public.conversation_events e
            WHERE e.conversation_id = b.id AND e.event_type = 'agent_reply' AND e.actor_id IS NOT NULL
            ORDER BY e.created_at LIMIT 1),
          (SELECT e.actor_id FROM public.conversation_events e
            WHERE e.conversation_id = b.id AND e.event_type = 'claimed' AND e.actor_id IS NOT NULL
            ORDER BY e.created_at LIMIT 1),
          b.assigned_to) AS credited_to
      ) cr ON true
      LEFT JOIN public.profiles p ON p.id = cr.credited_to
      WHERE cr.credited_to IS NOT NULL
      GROUP BY 1 ORDER BY 2 DESC) x), '[]'::jsonb),
  'by_day', COALESCE((SELECT jsonb_agg(x ORDER BY x->>'day') FROM (
      SELECT jsonb_build_object(
        'day', to_char(date_trunc('day', b.created_at AT TIME ZONE _tz), 'YYYY-MM-DD'),
        'conversations', COUNT(*),
        'avg_response', ROUND(AVG(b.resp_min)::numeric,1),
        'breaches', COUNT(*) FILTER (WHERE b.is_breach)
      ) AS x FROM b GROUP BY date_trunc('day', b.created_at AT TIME ZONE _tz)) y), '[]'::jsonb),
  'by_hour', COALESCE((SELECT jsonb_agg(x ORDER BY (x->>'hour')::int) FROM (
      SELECT jsonb_build_object(
        'hour', EXTRACT(HOUR FROM b.created_at AT TIME ZONE _tz)::int,
        'conversations', COUNT(*),
        'avg_response', ROUND(AVG(b.resp_min)::numeric,1)
      ) AS x FROM b GROUP BY EXTRACT(HOUR FROM b.created_at AT TIME ZONE _tz)) y), '[]'::jsonb)
)
$function$;

REVOKE ALL ON FUNCTION public.report_sla(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_sla(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text) TO service_role;