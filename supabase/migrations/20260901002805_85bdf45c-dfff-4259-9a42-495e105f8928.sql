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
    WHEN 'waiting' THEN ' AND assigned_to IS NULL AND status::text IN (''new'',''waiting'',''escalated'',''follow_up'')'
    WHEN 'escalated' THEN ' AND escalation_requested'
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
               (escalation_requested AND (resp_min IS NULL OR resp_min > %s)) AS sla_breached
        FROM filtered ORDER BY %I %s NULLS LAST LIMIT %s OFFSET %s
      ) t), '[]'::jsonb)
  $q$, flag_sql, _sla, sort_col, dir, GREATEST(_limit,1), GREATEST(_offset,0))
  INTO total, rows
  USING _org, _from, _to, _dept, _staff, _statuses, _website, _type, _transfer, _priority;

  RETURN jsonb_build_object('total', total, 'rows', rows);
END;
$fn$;

REVOKE ALL ON FUNCTION public.report_tickets(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer,text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_tickets(uuid,timestamptz,timestamptz,uuid[],uuid[],text[],uuid,text,text,text,integer,text,text,text,integer,integer) TO service_role;