CREATE TABLE IF NOT EXISTS public.conversation_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, label)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversation_dispositions TO authenticated;
GRANT ALL ON public.conversation_dispositions TO service_role;

ALTER TABLE public.conversation_dispositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cdisp_select" ON public.conversation_dispositions
  FOR SELECT TO authenticated
  USING (public.can_access_org(organization_id));

CREATE POLICY "cdisp_write" ON public.conversation_dispositions
  FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'settings.manage', auth.uid()))
  WITH CHECK (public.has_perm(organization_id, 'settings.manage', auth.uid()));

CREATE TRIGGER conversation_dispositions_updated_at
  BEFORE UPDATE ON public.conversation_dispositions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS disposition_id uuid REFERENCES public.conversation_dispositions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_disposition ON public.conversations(disposition_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation ON public.internal_notes(conversation_id, created_at DESC);

-- Ticket explorer shows the recorded outcome alongside the timings.
CREATE OR REPLACE FUNCTION public.report_tickets(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _sla integer DEFAULT 15, _flag text DEFAULT 'all'::text, _sort text DEFAULT 'created_at'::text, _dir text DEFAULT 'desc'::text, _limit integer DEFAULT 50, _offset integer DEFAULT 0)
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
    WHEN 'disposition' THEN 'disposition'
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
        disp.label AS disposition,
        (SELECT ROUND(AVG(r.score)::numeric,1) FROM public.conversation_ratings r WHERE r.conversation_id = c.id) AS csat
      FROM public.report_conv($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) c
      LEFT JOIN public.departments d ON d.id = c.department_id
      LEFT JOIN public.profiles p ON p.id = c.assigned_to
      LEFT JOIN public.contacts ct ON ct.id = c.contact_id
      LEFT JOIN public.websites w ON w.id = c.website_id
      LEFT JOIN public.conversation_dispositions disp ON disp.id = c.disposition_id
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
               disposition,
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

-- Overview gains an outcomes breakdown for completed conversations.
CREATE OR REPLACE FUNCTION public.report_overview(_org uuid, _from timestamp with time zone, _to timestamp with time zone, _dept uuid[] DEFAULT NULL::uuid[], _staff uuid[] DEFAULT NULL::uuid[], _statuses text[] DEFAULT NULL::text[], _website uuid DEFAULT NULL::uuid, _type text DEFAULT NULL::text, _transfer text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _sla integer DEFAULT 15)
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

REVOKE ALL ON FUNCTION public.report_tickets(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text, text, text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_tickets(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text, text, text, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.report_overview(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_overview(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer) TO service_role;