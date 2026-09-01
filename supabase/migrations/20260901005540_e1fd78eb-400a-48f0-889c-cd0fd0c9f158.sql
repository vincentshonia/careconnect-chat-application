
-- 1. Optional, administrator-configured performance goals -------------------
CREATE TABLE IF NOT EXISTS public.performance_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  role app_role,
  first_response_minutes numeric,
  sla_percent numeric,
  completion_percent numeric,
  csat_target numeric,
  followup_max integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.performance_targets TO authenticated;
GRANT ALL ON public.performance_targets TO service_role;

ALTER TABLE public.performance_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read their organization targets"
  ON public.performance_targets FOR SELECT TO authenticated
  USING (public.can_access_org(organization_id));

CREATE POLICY "Admins manage targets"
  ON public.performance_targets FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE TRIGGER performance_targets_updated_at
  BEFORE UPDATE ON public.performance_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS performance_targets_org_idx
  ON public.performance_targets (organization_id, department_id);

-- 2. Single dashboard aggregation -------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_metrics(
  _org uuid,
  _user uuid,
  _dept uuid[],
  _scope text,
  _from timestamptz,
  _to timestamptz,
  _prev_from timestamptz,
  _prev_to timestamptz,
  _sla integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  open_statuses conversation_status[] := ARRAY['new','waiting','assigned','active','escalated','pending_visitor','pending_internal','follow_up']::conversation_status[];
  active_statuses conversation_status[] := ARRAY['assigned','active','pending_visitor','pending_internal','follow_up']::conversation_status[];
  bucket text := CASE WHEN _to - _from <= interval '2 days' THEN 'hour' ELSE 'day' END;
  day_start timestamptz := date_trunc('day', now());
  result jsonb := '{}'::jsonb;
  section jsonb;
BEGIN
  -- ---------- current state (never date filtered) ----------
  SELECT jsonb_build_object(
    'my_open', count(*) FILTER (WHERE c.assigned_to = _user AND c.status = ANY(open_statuses)),
    'my_active', count(*) FILTER (WHERE c.assigned_to = _user AND c.status = ANY(active_statuses)),
    'my_waiting_reply', count(*) FILTER (
      WHERE c.assigned_to = _user AND c.status = ANY(open_statuses)
        AND c.last_visitor_message_at IS NOT NULL
        AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_visitor_message_at)),
    'my_followups', count(*) FILTER (WHERE c.assigned_to = _user AND c.status IN ('follow_up','pending_internal')),
    'my_sla_risk', count(*) FILTER (
      WHERE c.assigned_to = _user AND c.status = ANY(open_statuses)
        AND c.first_agent_response_at IS NULL AND c.first_human_requested_at IS NOT NULL
        AND now() - c.first_human_requested_at > make_interval(mins => greatest(1, (_sla * 0.8)::int))),
    'dept_waiting', count(*) FILTER (
      WHERE c.assigned_to IS NULL AND c.status IN ('new','waiting','escalated','follow_up')
        AND (_dept IS NULL OR array_length(_dept,1) IS NULL OR c.department_id = ANY(_dept) OR c.department_id IS NULL)),
    'org_open', count(*) FILTER (WHERE c.status = ANY(open_statuses)),
    'org_waiting', count(*) FILTER (WHERE c.status IN ('waiting','escalated')),
    'org_unassigned', count(*) FILTER (WHERE c.assigned_to IS NULL AND c.status = ANY(open_statuses)),
    'org_active', count(*) FILTER (WHERE c.status = ANY(active_statuses)),
    'org_agent_requested', count(*) FILTER (WHERE c.escalation_requested AND c.status = ANY(open_statuses)),
    'org_sla_risk', count(*) FILTER (
      WHERE c.status = ANY(open_statuses) AND c.first_agent_response_at IS NULL
        AND c.first_human_requested_at IS NOT NULL
        AND now() - c.first_human_requested_at > make_interval(mins => greatest(1,(_sla * 0.8)::int)))
  )
  INTO section
  FROM conversations c
  WHERE c.organization_id = _org;

  SELECT section
    || jsonb_build_object(
      'my_completed_today',
        (SELECT count(*) FROM conversations c
          WHERE c.organization_id = _org
            AND ((c.resolved_by = _user AND c.resolved_at >= day_start)
              OR (c.closed_by = _user AND c.closed_at >= day_start))),
      'org_completed_today',
        (SELECT count(*) FROM conversations c
          WHERE c.organization_id = _org
            AND (c.resolved_at >= day_start OR c.closed_at >= day_start)),
      'org_open_intakes',
        (SELECT count(*) FROM intake_requests i
          WHERE i.organization_id = _org AND i.stage NOT IN ('approved','denied','withdrawn')),
      'capacity_max', coalesce((SELECT p.max_concurrent_chats FROM profiles p WHERE p.id = _user), 0)
    )
  INTO section;

  result := jsonb_set(result, '{current}', section);

  -- ---------- my workload breakdown ----------
  SELECT coalesce(jsonb_agg(jsonb_build_object('status', s.status, 'count', s.n) ORDER BY s.n DESC), '[]'::jsonb)
  INTO section
  FROM (
    SELECT c.status::text AS status, count(*) AS n
    FROM conversations c
    WHERE c.organization_id = _org AND c.assigned_to = _user AND c.status = ANY(open_statuses)
    GROUP BY c.status
  ) s;
  result := jsonb_set(result, '{workload}', section);

  -- ---------- personal performance (current + previous period) ----------
  result := jsonb_set(result, '{performance}',
    public.dashboard_staff_performance(_org, _user, _from, _to, _sla));
  result := jsonb_set(result, '{previous}',
    public.dashboard_staff_performance(_org, _user, _prev_from, _prev_to, _sla));

  -- ---------- trend ----------
  WITH buckets AS (
    SELECT generate_series(date_trunc(bucket, _from), date_trunc(bucket, _to), ('1 ' || bucket)::interval) AS b
  ),
  handled AS (
    SELECT date_trunc(bucket, x.at) AS b, count(DISTINCT x.conversation_id) AS n
    FROM (
      SELECT m.conversation_id, m.created_at AS at FROM messages m
        WHERE m.organization_id = _org AND m.sender_user_id = _user
          AND m.created_at >= _from AND m.created_at < _to
      UNION ALL
      SELECT e.conversation_id, e.created_at FROM conversation_events e
        WHERE e.organization_id = _org AND e.actor_id = _user
          AND e.event_type IN ('claimed','resolved','closed')
          AND e.created_at >= _from AND e.created_at < _to
    ) x GROUP BY 1
  ),
  completed AS (
    SELECT date_trunc(bucket, coalesce(c.resolved_at, c.closed_at)) AS b, count(*) AS n
    FROM conversations c
    WHERE c.organization_id = _org
      AND ((c.resolved_by = _user AND c.resolved_at >= _from AND c.resolved_at < _to)
        OR (c.closed_by = _user AND c.closed_at >= _from AND c.closed_at < _to))
    GROUP BY 1
  ),
  response AS (
    SELECT date_trunc(bucket, c.first_agent_response_at) AS b,
           avg(extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at)))/60.0) AS v
    FROM conversations c
    WHERE c.organization_id = _org AND c.assigned_to = _user
      AND c.first_agent_response_at >= _from AND c.first_agent_response_at < _to
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'bucket', to_char(b.b, CASE WHEN bucket = 'hour' THEN 'HH24:MI' ELSE 'Mon DD' END),
    'handled', coalesce(h.n, 0),
    'completed', coalesce(cp.n, 0),
    'response', round(coalesce(r.v, 0)::numeric, 1)
  ) ORDER BY b.b), '[]'::jsonb)
  INTO section
  FROM buckets b
  LEFT JOIN handled h ON h.b = b.b
  LEFT JOIN completed cp ON cp.b = b.b
  LEFT JOIN response r ON r.b = b.b;
  result := jsonb_set(result, '{trend}', section);

  -- ---------- needs my attention ----------
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO section FROM (
    SELECT c.id, c.reference, coalesce(c.subject, 'Website chat') AS subject, c.status::text AS status,
      c.priority::text AS priority, d.name AS department,
      ct.full_name AS contact_name,
      c.last_message_at,
      round(extract(epoch FROM (now() - c.last_message_at))/60.0) AS age_minutes,
      CASE
        WHEN c.last_visitor_message_at IS NOT NULL
             AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_visitor_message_at)
          THEN 'Waiting for your reply'
        WHEN c.first_agent_response_at IS NULL AND c.first_human_requested_at IS NOT NULL
             AND now() - c.first_human_requested_at > make_interval(mins => greatest(1,(_sla*0.8)::int))
          THEN 'SLA at risk'
        WHEN c.status = 'escalated' THEN 'Escalated'
        WHEN c.status = 'follow_up' THEN 'Follow-up due'
        WHEN c.status = 'pending_internal' THEN 'Pending internal action'
        WHEN now() - c.last_message_at > interval '24 hours' THEN 'Stale conversation'
        ELSE 'Assigned to you'
      END AS reason,
      CASE
        WHEN c.last_visitor_message_at IS NOT NULL
             AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_visitor_message_at) THEN 1
        WHEN c.first_agent_response_at IS NULL AND c.first_human_requested_at IS NOT NULL
             AND now() - c.first_human_requested_at > make_interval(mins => greatest(1,(_sla*0.8)::int)) THEN 2
        WHEN c.status = 'escalated' THEN 3
        WHEN c.status = 'follow_up' THEN 4
        WHEN now() - c.last_message_at > interval '24 hours' THEN 5
        WHEN c.status = 'pending_internal' THEN 6
        ELSE 7
      END AS rank
    FROM conversations c
    LEFT JOIN departments d ON d.id = c.department_id
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.organization_id = _org AND c.assigned_to = _user AND c.status = ANY(open_statuses)
    ORDER BY rank, c.last_message_at
    LIMIT 8
  ) t;
  result := jsonb_set(result, '{needs_attention}', section);

  -- ---------- available to claim ----------
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) INTO section FROM (
    SELECT c.id, c.reference, coalesce(c.subject, 'Website chat') AS subject, c.status::text AS status,
      c.priority::text AS priority, d.name AS department, ct.full_name AS contact_name,
      c.escalation_requested,
      round(extract(epoch FROM (now() - coalesce(c.first_human_requested_at, c.created_at)))/60.0) AS waiting_minutes
    FROM conversations c
    LEFT JOIN departments d ON d.id = c.department_id
    LEFT JOIN contacts ct ON ct.id = c.contact_id
    WHERE c.organization_id = _org AND c.assigned_to IS NULL
      AND c.status IN ('new','waiting','escalated','follow_up')
      AND (_scope <> 'self' OR _dept IS NULL OR array_length(_dept,1) IS NULL
           OR c.department_id = ANY(_dept) OR c.department_id IS NULL)
    ORDER BY c.escalation_requested DESC, coalesce(c.first_human_requested_at, c.created_at)
    LIMIT 10
  ) t;
  result := jsonb_set(result, '{available}', section);

  -- ---------- department benchmark (privacy safe averages only) ----------
  SELECT jsonb_build_object(
    'department_avg_first_response',
      round(avg(extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at)))/60.0)::numeric, 2)
  )
  INTO section
  FROM conversations c
  WHERE c.organization_id = _org
    AND c.first_agent_response_at IS NOT NULL
    AND c.first_agent_response_at >= _from AND c.first_agent_response_at < _to
    AND (_dept IS NULL OR array_length(_dept,1) IS NULL OR c.department_id = ANY(_dept));
  result := jsonb_set(result, '{benchmark}', coalesce(section, '{}'::jsonb));

  -- ---------- goals ----------
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'first_response_minutes', t.first_response_minutes,
    'sla_percent', t.sla_percent,
    'completion_percent', t.completion_percent,
    'csat_target', t.csat_target,
    'followup_max', t.followup_max
  )), '[]'::jsonb)
  INTO section
  FROM performance_targets t
  WHERE t.organization_id = _org
    AND (t.department_id IS NULL OR (_dept IS NOT NULL AND t.department_id = ANY(_dept)));
  result := jsonb_set(result, '{goals}', section);

  -- ---------- my requests ----------
  SELECT jsonb_build_object(
    'mine', count(*) FILTER (WHERE i.assigned_to = _user AND i.stage NOT IN ('approved','denied','withdrawn')),
    'overdue', count(*) FILTER (WHERE i.assigned_to = _user AND i.due_date < current_date AND i.stage NOT IN ('approved','denied','withdrawn')),
    'new_referrals', count(*) FILTER (WHERE i.request_type = 'referral' AND i.stage = 'new'),
    'enrollment', count(*) FILTER (WHERE i.request_type = 'enrollment' AND i.stage NOT IN ('approved','denied','withdrawn')),
    'callbacks', count(*) FILTER (WHERE i.request_type = 'callback' AND i.stage NOT IN ('approved','denied','withdrawn')),
    'completed', count(*) FILTER (WHERE i.stage = 'approved' AND i.closed_at >= _from AND i.closed_at < _to),
    'open_total', count(*) FILTER (WHERE i.stage NOT IN ('approved','denied','withdrawn'))
  )
  INTO section
  FROM intake_requests i
  WHERE i.organization_id = _org
    AND (_scope <> 'self' OR i.assigned_to = _user OR _dept IS NULL
         OR array_length(_dept,1) IS NULL OR i.department_id = ANY(_dept));
  result := jsonb_set(result, '{requests}', section);

  IF _scope = 'self' THEN
    RETURN result;
  END IF;

  -- ---------- team / department scope ----------
  SELECT coalesce(jsonb_agg(t ORDER BY t.name), '[]'::jsonb) INTO section FROM (
    SELECT d.id, d.name,
      count(c.id) FILTER (WHERE c.status = ANY(open_statuses)) AS open,
      count(c.id) FILTER (WHERE c.status IN ('waiting','escalated') AND c.assigned_to IS NULL) AS waiting,
      count(c.id) FILTER (WHERE c.status = ANY(active_statuses)) AS active,
      count(c.id) FILTER (WHERE c.resolved_at >= day_start OR c.closed_at >= day_start) AS completed_today,
      count(c.id) FILTER (WHERE c.status = ANY(open_statuses) AND c.first_agent_response_at IS NULL
        AND c.first_human_requested_at IS NOT NULL
        AND now() - c.first_human_requested_at > make_interval(mins => greatest(1,(_sla*0.8)::int))) AS sla_risk,
      round(extract(epoch FROM (now() - min(coalesce(c.first_human_requested_at, c.created_at))
        FILTER (WHERE c.assigned_to IS NULL AND c.status IN ('new','waiting','escalated'))))/60.0) AS oldest_waiting_minutes,
      round(avg(extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at)))/60.0)
        FILTER (WHERE c.first_agent_response_at >= _from AND c.first_agent_response_at < _to)::numeric, 2) AS avg_first_response,
      round(100.0 * count(c.id) FILTER (WHERE c.first_agent_response_at IS NOT NULL
          AND c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at) <= make_interval(mins => _sla)
          AND c.first_agent_response_at >= _from AND c.first_agent_response_at < _to)
        / nullif(count(c.id) FILTER (WHERE c.first_agent_response_at >= _from AND c.first_agent_response_at < _to), 0), 0) AS sla_percent,
      sum(c.transfer_count) FILTER (WHERE c.created_at >= _from AND c.created_at < _to) AS transfers,
      (SELECT count(*) FROM department_members dm
         JOIN profiles p ON p.id = dm.user_id
        WHERE dm.department_id = d.id AND p.presence = 'available') AS available_staff,
      (SELECT round(avg(r.score)::numeric, 2) FROM conversation_ratings r
         JOIN conversations cc ON cc.id = r.conversation_id
        WHERE cc.department_id = d.id AND r.created_at >= _from AND r.created_at < _to) AS csat
    FROM departments d
    LEFT JOIN conversations c ON c.department_id = d.id AND c.organization_id = _org
    WHERE d.organization_id = _org
      AND (_scope = 'organization' OR _dept IS NULL OR array_length(_dept,1) IS NULL OR d.id = ANY(_dept))
    GROUP BY d.id, d.name
  ) t;
  result := jsonb_set(result, '{departments}', section);

  -- ---------- staff snapshot ----------
  SELECT coalesce(jsonb_agg(t ORDER BY t.full_name), '[]'::jsonb) INTO section FROM (
    SELECT p.id, p.full_name, p.presence, p.max_concurrent_chats,
      coalesce(dn.names, '—') AS department,
      (SELECT count(*) FROM conversations c
        WHERE c.organization_id = _org AND c.assigned_to = p.id AND c.status = ANY(active_statuses)) AS active,
      (SELECT count(*) FROM conversations c
        WHERE c.organization_id = _org AND c.assigned_to = p.id AND c.status = ANY(open_statuses)
          AND c.last_visitor_message_at IS NOT NULL
          AND (c.last_agent_message_at IS NULL OR c.last_agent_message_at < c.last_visitor_message_at)) AS waiting_reply,
      (SELECT count(*) FROM conversations c
        WHERE c.organization_id = _org
          AND ((c.resolved_by = p.id AND c.resolved_at >= day_start) OR (c.closed_by = p.id AND c.closed_at >= day_start))) AS completed_today,
      (SELECT round(avg(extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at)))/60.0)::numeric, 2)
         FROM conversations c
        WHERE c.organization_id = _org AND c.assigned_to = p.id
          AND c.first_agent_response_at >= _from AND c.first_agent_response_at < _to) AS avg_first_response,
      (SELECT round(100.0 * count(*) FILTER (WHERE c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at) <= make_interval(mins => _sla))
              / nullif(count(*), 0), 0)
         FROM conversations c
        WHERE c.organization_id = _org AND c.assigned_to = p.id
          AND c.first_agent_response_at >= _from AND c.first_agent_response_at < _to) AS sla_percent
    FROM organization_memberships om
    JOIN profiles p ON p.id = om.user_id
    LEFT JOIN LATERAL (
      SELECT string_agg(d.name, ', ') AS names
      FROM department_members dm JOIN departments d ON d.id = dm.department_id
      WHERE dm.user_id = p.id AND dm.organization_id = _org
    ) dn ON true
    WHERE om.organization_id = _org AND om.status = 'active'
      AND (_scope = 'organization' OR _dept IS NULL OR array_length(_dept,1) IS NULL
           OR EXISTS (SELECT 1 FROM department_members dm2 WHERE dm2.user_id = p.id AND dm2.department_id = ANY(_dept)))
  ) t;
  result := jsonb_set(result, '{staff}', section);

  -- ---------- staff availability ----------
  SELECT jsonb_build_object(
    'available', count(*) FILTER (WHERE p.presence = 'available'),
    'busy', count(*) FILTER (WHERE p.presence = 'busy'),
    'away', count(*) FILTER (WHERE p.presence = 'away'),
    'offline', count(*) FILTER (WHERE p.presence NOT IN ('available','busy','away')),
    'at_capacity', count(*) FILTER (WHERE p.max_concurrent_chats > 0 AND
      (SELECT count(*) FROM conversations c WHERE c.organization_id = _org AND c.assigned_to = p.id
         AND c.status = ANY(active_statuses)) >= p.max_concurrent_chats)
  )
  INTO section
  FROM organization_memberships om
  JOIN profiles p ON p.id = om.user_id
  WHERE om.organization_id = _org AND om.status = 'active';
  result := jsonb_set(result, '{availability}', section);

  IF _scope <> 'organization' THEN
    RETURN result;
  END IF;

  -- ---------- organization performance for the selected period ----------
  SELECT jsonb_build_object(
    'total', count(*),
    'human_requests', count(*) FILTER (WHERE c.first_human_requested_at IS NOT NULL),
    'claimed', count(*) FILTER (WHERE c.claimed_at IS NOT NULL),
    'completed', count(*) FILTER (WHERE c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL),
    'resolved', count(*) FILTER (WHERE c.resolved_at IS NOT NULL),
    'closed', count(*) FILTER (WHERE c.closed_at IS NOT NULL AND c.resolved_at IS NULL),
    'reopened', count(*) FILTER (WHERE c.reopened_count > 0),
    'escalated', count(*) FILTER (WHERE c.escalation_requested),
    'transfer_rate', round(100.0 * count(*) FILTER (WHERE c.transfer_count > 0) / nullif(count(*),0), 0),
    'avg_first_response', round(avg(extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at)))/60.0)::numeric, 2),
    'avg_resolution', round(avg(extract(epoch FROM (coalesce(c.resolved_at, c.closed_at) - c.created_at))/60.0)::numeric, 2),
    'sla_percent', round(100.0 * count(*) FILTER (WHERE c.first_agent_response_at IS NOT NULL
        AND c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at) <= make_interval(mins => _sla))
      / nullif(count(*) FILTER (WHERE c.first_agent_response_at IS NOT NULL), 0), 0)
  )
  INTO section
  FROM conversations c
  WHERE c.organization_id = _org AND c.created_at >= _from AND c.created_at < _to;

  SELECT section || jsonb_build_object(
    'csat', (SELECT round(avg(r.score)::numeric,2) FROM conversation_ratings r
              WHERE r.organization_id = _org AND r.created_at >= _from AND r.created_at < _to),
    'csat_count', (SELECT count(*) FROM conversation_ratings r
              WHERE r.organization_id = _org AND r.created_at >= _from AND r.created_at < _to),
    'ai_total', (SELECT count(*) FROM ai_responses a WHERE a.organization_id = _org AND a.created_at >= _from AND a.created_at < _to),
    'ai_deflected', (SELECT count(*) FROM ai_responses a WHERE a.organization_id = _org AND NOT a.escalated AND a.created_at >= _from AND a.created_at < _to)
  ) INTO section;
  result := jsonb_set(result, '{organization}', section);

  RETURN result;
END;
$$;

-- Per-staff performance, used for the caller and for the previous period.
CREATE OR REPLACE FUNCTION public.dashboard_staff_performance(
  _org uuid,
  _user uuid,
  _from timestamptz,
  _to timestamptz,
  _sla integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH handled AS (
    SELECT DISTINCT conversation_id FROM (
      SELECT m.conversation_id FROM messages m
        WHERE m.organization_id = _org AND m.sender_user_id = _user
          AND m.created_at >= _from AND m.created_at < _to
      UNION ALL
      SELECT e.conversation_id FROM conversation_events e
        WHERE e.organization_id = _org AND e.actor_id = _user
          AND e.event_type IN ('claimed','resolved','closed','reassigned')
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
      round(avg(extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at)))/60.0)::numeric, 2) AS avg_first_response,
      round((percentile_cont(0.5) WITHIN GROUP (
        ORDER BY extract(epoch FROM (c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at)))/60.0))::numeric, 2) AS median_first_response,
      round(avg(extract(epoch FROM (c.claimed_at - c.first_human_requested_at))/60.0)
        FILTER (WHERE c.claimed_at IS NOT NULL AND c.first_human_requested_at IS NOT NULL)::numeric, 2) AS avg_claim_time,
      count(*) FILTER (WHERE c.first_agent_response_at IS NOT NULL) AS responded,
      count(*) FILTER (WHERE c.first_agent_response_at IS NOT NULL
        AND c.first_agent_response_at - coalesce(c.first_human_requested_at, c.created_at) <= make_interval(mins => _sla)) AS in_sla
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
$$;

REVOKE ALL ON FUNCTION public.dashboard_metrics(uuid, uuid, uuid[], text, timestamptz, timestamptz, timestamptz, timestamptz, integer) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_staff_performance(uuid, uuid, timestamptz, timestamptz, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(uuid, uuid, uuid[], text, timestamptz, timestamptz, timestamptz, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_staff_performance(uuid, uuid, timestamptz, timestamptz, integer) TO service_role;
