-- 1. Reporting/knowledge functions: backend-only execution, made permanent.
REVOKE EXECUTE ON FUNCTION public.dashboard_metrics(uuid, uuid, uuid[], text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(uuid, uuid, uuid[], text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.report_sla(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_sla(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.report_volume(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_volume(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, text) TO service_role;

-- Guard: no elevated reporting/knowledge function may be callable by the browser roles.
DO $guard$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', ' ORDER BY p.proname)
    INTO leaked
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND (p.proname LIKE 'report\_%' OR p.proname LIKE 'dashboard\_%'
         OR p.proname LIKE 'match\_knowledge%' OR p.proname LIKE 'replace\_chunks%')
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER reporting functions are executable by anon/authenticated: %', leaked;
  END IF;
END
$guard$;

-- 2. Append-only guard on audit_logs: allow backend connections and the
--    referential SET NULL housekeeping, keep refusing everything else.
CREATE OR REPLACE FUNCTION public.guard_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  claims text := current_setting('request.jwt.claims', true);
  jwt_role text;
  old_rest jsonb;
  new_rest jsonb;
BEGIN
  -- Direct database / service-role connections are trusted maintenance paths.
  IF claims IS NULL OR claims = '' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  BEGIN
    jwt_role := claims::jsonb->>'role';
  EXCEPTION WHEN others THEN
    jwt_role := NULL;
  END;

  IF jwt_role = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Referential actions: ON DELETE SET NULL blanking one of the three
  -- reference columns, with every other column untouched.
  IF TG_OP = 'UPDATE' THEN
    old_rest := to_jsonb(OLD) - 'organization_id' - 'website_id' - 'actor_id';
    new_rest := to_jsonb(NEW) - 'organization_id' - 'website_id' - 'actor_id';
    IF old_rest = new_rest
       AND (NEW.organization_id IS NOT DISTINCT FROM OLD.organization_id OR NEW.organization_id IS NULL)
       AND (NEW.website_id IS NOT DISTINCT FROM OLD.website_id OR NEW.website_id IS NULL)
       AND (NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id OR NEW.actor_id IS NULL)
       AND (NEW.organization_id IS DISTINCT FROM OLD.organization_id
            OR NEW.website_id IS DISTINCT FROM OLD.website_id
            OR NEW.actor_id IS DISTINCT FROM OLD.actor_id)
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$function$;

-- 3a. report_ai: abandoned traffic is not an assistant completion or failure.
CREATE OR REPLACE FUNCTION public.report_ai(_org uuid, _from timestamptz, _to timestamptz, _dept uuid[] DEFAULT NULL::uuid[], _website uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH c AS (
  SELECT * FROM public.conversations
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
  -- Spam, archived and abandoned traffic is not a real service interaction, so
  -- it can neither earn nor cost the assistant a completion.
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

-- 3b. report_overview: only an open conversation can be breaching right now.
CREATE OR REPLACE FUNCTION public.report_overview(_org uuid, _from timestamptz, _to timestamptz, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _sla integer DEFAULT 15)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
), snap AS (
  SELECT
    COUNT(*) FILTER (WHERE escalation_requested AND assigned_to IS NULL AND status::text IN ('waiting','escalated','follow_up')) AS waiting_now,
    COUNT(*) FILTER (WHERE status::text IN ('assigned','active')) AS active_now,
    COUNT(*) FILTER (WHERE status::text NOT IN ('resolved','closed','archived','spam','abandoned')) AS open_now,
    COUNT(*) FILTER (WHERE assigned_to IS NULL AND status::text NOT IN ('resolved','closed','archived','spam','abandoned')) AS unassigned_now,
    -- "Now" means now: a finished conversation can no longer be breaching.
    COUNT(*) FILTER (WHERE first_agent_response_at IS NULL AND escalation_requested
      AND status::text IN ('waiting','escalated','assigned','active','follow_up','pending_visitor','pending_internal')
      AND COALESCE(first_human_requested_at, requested_agent_at, created_at) < now() - make_interval(mins => _sla)) AS breaching_now,
    MIN(COALESCE(first_human_requested_at, requested_agent_at, created_at)) FILTER (WHERE escalation_requested AND assigned_to IS NULL AND status::text IN ('waiting','escalated','follow_up')) AS oldest_waiting
  FROM public.conversations
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

-- 3c. report_tickets: the breach flag and the sla_breached column require an open status.
CREATE OR REPLACE FUNCTION public.report_tickets(_org uuid, _from timestamptz, _to timestamptz, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _sla integer DEFAULT 15, _flag text DEFAULT 'all'::text, _sort text DEFAULT 'created_at'::text, _dir text DEFAULT 'desc'::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sort_col text;
  dir text := CASE WHEN lower(_dir) = 'asc' THEN 'asc' ELSE 'desc' END;
  flag_sql text := '';
  open_statuses text := '(''waiting'',''escalated'',''assigned'',''active'',''follow_up'',''pending_visitor'',''pending_internal'')';
  ai_answered text := ' AND EXISTS (SELECT 1 FROM public.ai_responses r WHERE r.conversation_id = calc.id)'
    || ' AND NOT public.conversation_human_touched(calc.id)'
    || ' AND status::text NOT IN (''spam'',''archived'',''abandoned'')';
  total bigint;
  rows jsonb;
BEGIN
  sort_col := CASE _sort
    WHEN 'reference' THEN 'reference'
    WHEN 'status' THEN 'status'
    WHEN 'department' THEN 'department_name'
    WHEN 'assigned' THEN 'assigned_name'
    WHEN 'priority' THEN 'priority'
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
    WHEN 'open' THEN ' AND status::text NOT IN (''resolved'',''closed'',''archived'',''spam'',''abandoned'')'
    WHEN 'completed' THEN ' AND status::text IN (''resolved'',''closed'')'
    WHEN 'resolved' THEN ' AND status::text = ''resolved'''
    WHEN 'closed' THEN ' AND status::text = ''closed'''
    WHEN 'unassigned' THEN ' AND assigned_to IS NULL AND status::text NOT IN (''resolved'',''closed'',''archived'',''spam'',''abandoned'')'
    WHEN 'breach' THEN format(' AND escalation_requested AND (resp_min IS NULL OR resp_min > %s) AND status::text IN %s', _sla, open_statuses)
    WHEN 'no_response' THEN ' AND escalation_requested AND first_agent_response_at IS NULL AND status::text IN (''closed'',''abandoned'')'
    WHEN 'stale' THEN ' AND status::text NOT IN (''resolved'',''closed'',''archived'',''spam'',''abandoned'') AND last_message_at < now() - interval ''4 hours'''
    WHEN 'aged' THEN ' AND status::text NOT IN (''resolved'',''closed'',''archived'',''spam'',''abandoned'') AND created_at < now() - interval ''24 hours'''
    WHEN 'multi_transfer' THEN ' AND COALESCE(transfer_count,0) > 1'
    WHEN 'waiting' THEN ' AND escalation_requested AND assigned_to IS NULL AND status::text IN (''waiting'',''escalated'',''follow_up'')'
    WHEN 'escalated' THEN ' AND escalation_requested'
    WHEN 'transferred' THEN ' AND COALESCE(transfer_count,0) > 0'
    WHEN 'reopened' THEN ' AND COALESCE(reopened_count,0) > 0'
    WHEN 'ai_only_completed' THEN ai_answered
      || ' AND status::text IN (''resolved'',''closed'') AND COALESCE(resolved_at, closed_at) IS NOT NULL'
    WHEN 'ai_unresolved' THEN ai_answered
      || ' AND NOT (status::text IN (''resolved'',''closed'') AND COALESCE(resolved_at, closed_at) IS NOT NULL)'
    ELSE '' END;

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
               last_message_at, last_visitor_message_at, last_agent_message_at, claimed_at,
               resolved_at, closed_at, csat,
               (escalation_requested AND (resp_min IS NULL OR resp_min > %s)
                 AND status::text IN %s) AS sla_breached
        -- `id` is a stable tiebreaker: without it two rows with equal sort keys
        -- can swap between pages, duplicating one row and skipping another.
        FROM filtered ORDER BY %I %s NULLS LAST, id ASC LIMIT %s OFFSET %s
      ) t), '[]'::jsonb)
  $q$, flag_sql, _sla, open_statuses, sort_col, dir, GREATEST(_limit,1), GREATEST(_offset,0))
  INTO total, rows
  USING _org, _from, _to, _dept, _staff, _statuses, _website, _type, _transfer, _priority;

  RETURN jsonb_build_object('total', total, 'rows', rows);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.report_ai(uuid, timestamptz, timestamptz, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_ai(uuid, timestamptz, timestamptz, uuid[], uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.report_overview(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_overview(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.report_tickets(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_tickets(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text, text, text, integer, integer) TO service_role;