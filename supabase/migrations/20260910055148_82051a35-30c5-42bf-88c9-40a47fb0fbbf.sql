-- One definition of "waiting for a human" everywhere, plus an "abandoned"
-- status that never counts as completed or as AI-contained.

CREATE OR REPLACE FUNCTION public.claimable_conversation_statuses()
 RETURNS conversation_status[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY['waiting','escalated','follow_up']::conversation_status[]
$function$;

DO $mig$
DECLARE
  d text;
  n text;
  pairs text[][] := ARRAY[
    -- queue predicate (dashboard_metrics)
    ARRAY[
      'c.assigned_to IS NULL AND c.status IN (''new'',''waiting'',''escalated'',''follow_up'')',
      'c.escalation_requested AND c.assigned_to IS NULL AND c.status IN (''waiting'',''escalated'',''follow_up'')'],
    ARRAY[
      '''org_waiting'', count(*) FILTER (WHERE c.status IN (''waiting'',''escalated'')),',
      '''org_waiting'', count(*) FILTER (WHERE c.escalation_requested AND c.assigned_to IS NULL AND c.status IN (''waiting'',''escalated'',''follow_up'')),'],
    ARRAY[
      'FILTER (WHERE c.status IN (''waiting'',''escalated'') AND c.assigned_to IS NULL)',
      'FILTER (WHERE c.escalation_requested AND c.assigned_to IS NULL AND c.status IN (''waiting'',''escalated'',''follow_up''))'],
    ARRAY[
      'FILTER (WHERE c.assigned_to IS NULL AND c.status IN (''new'',''waiting'',''escalated''))',
      'FILTER (WHERE c.escalation_requested AND c.assigned_to IS NULL AND c.status IN (''waiting'',''escalated'',''follow_up''))'],
    ARRAY[
      'AND c.status IN (''new'',''waiting'',''escalated'',''follow_up'')' || chr(10) || '      AND (_scope <> ''self''',
      'AND c.escalation_requested AND c.status IN (''waiting'',''escalated'',''follow_up'')' || chr(10) || '      AND (_scope <> ''self'''],
    -- abandoned is never "completed"
    ARRAY[
      'AND (c.resolved_at >= day_start OR c.closed_at >= day_start))',
      'AND (c.resolved_at >= day_start OR c.closed_at >= day_start) AND c.status <> ''abandoned'')'],
    ARRAY[
      'FILTER (WHERE c.resolved_at >= day_start OR c.closed_at >= day_start) AS completed_today',
      'FILTER (WHERE (c.resolved_at >= day_start OR c.closed_at >= day_start) AND c.status <> ''abandoned'') AS completed_today'],
    ARRAY[
      '''completed'', count(*) FILTER (WHERE c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL),',
      '''completed'', count(*) FILTER (WHERE (c.resolved_at IS NOT NULL OR c.closed_at IS NOT NULL) AND c.status <> ''abandoned''),' || chr(10) || '    ''abandoned'', count(*) FILTER (WHERE c.status = ''abandoned''),'],
    ARRAY[
      '''closed'', count(*) FILTER (WHERE c.closed_at IS NOT NULL AND c.resolved_at IS NULL),',
      '''closed'', count(*) FILTER (WHERE c.closed_at IS NOT NULL AND c.resolved_at IS NULL AND c.status <> ''abandoned''),'],
    -- report_overview / report_department_backlog
    ARRAY[
      'assigned_to IS NULL AND status::text IN (''new'',''waiting'',''escalated'',''follow_up'')',
      'escalation_requested AND assigned_to IS NULL AND status::text IN (''waiting'',''escalated'',''follow_up'')'],
    ARRAY[
      'c.assigned_to IS NULL AND c.status::text IN (''new'',''waiting'',''escalated'',''follow_up'')',
      'c.escalation_requested AND c.assigned_to IS NULL AND c.status::text IN (''waiting'',''escalated'',''follow_up'')'],
    ARRAY[
      '''ai_handled'', COUNT(*) FILTER (WHERE NOT escalation_requested),',
      '''ai_handled'', COUNT(*) FILTER (WHERE NOT escalation_requested AND status::text <> ''abandoned''),'],
    -- closed-status lists gain "abandoned"
    ARRAY[
      'status::text NOT IN (''resolved'',''closed'',''archived'',''spam'')',
      'status::text NOT IN (''resolved'',''closed'',''archived'',''spam'',''abandoned'')'],
    ARRAY[
      'status::text NOT IN (''''resolved'''',''''closed'''',''''archived'''',''''spam'''')',
      'status::text NOT IN (''''resolved'''',''''closed'''',''''archived'''',''''spam'''',''''abandoned'''')'],
    ARRAY[
      'status::text NOT IN (''''spam'''',''''archived'''')',
      'status::text NOT IN (''''spam'''',''''archived'''',''''abandoned'''')'],
    ARRAY[
      ' AND assigned_to IS NULL AND status::text IN (''''new'''',''''waiting'''',''''escalated'''',''''follow_up'''')',
      ' AND escalation_requested AND assigned_to IS NULL AND status::text IN (''''waiting'''',''''escalated'''',''''follow_up'''')'],
    -- claim_conversation must agree with the queue rule
    ARRAY[
      'IF c.status IN (''closed'',''resolved'',''archived'',''spam'') THEN',
      'IF c.status IN (''closed'',''resolved'',''archived'',''spam'',''abandoned'') THEN'],
    ARRAY[
      'IF NOT (c.status = ANY (public.claimable_conversation_statuses())) THEN',
      'IF NOT (c.status = ANY (public.claimable_conversation_statuses())) OR NOT c.escalation_requested THEN']
  ];
  i int;
  original text;
BEGIN
  FOR n IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND (p.proname LIKE 'report%' OR p.proname IN ('dashboard_metrics','claim_conversation'))
  LOOP
    d := pg_get_functiondef(n::regprocedure);
    original := d;
    FOR i IN 1 .. array_length(pairs, 1) LOOP
      d := replace(d, pairs[i][1], pairs[i][2]);
    END LOOP;
    IF d <> original THEN
      EXECUTE d;
    END IF;
  END LOOP;
END
$mig$;

-- Hourly abandonment sweep
INSERT INTO public.internal_tokens (name, token)
VALUES ('abandonment_sweep', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule('conversation-abandonment-sweep')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'conversation-abandonment-sweep');

SELECT cron.schedule(
  'conversation-abandonment-sweep',
  '0 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--7c742686-2fdb-4c35-ac0a-f41ff9b5c193.lovable.app/api/public/hooks/abandonment-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-careconnect-secret', (SELECT token FROM public.internal_tokens WHERE name = 'abandonment_sweep')
    ),
    body := '{}'::jsonb
  );
  $job$
);