DO $do$
DECLARE
  d text;
  old_kpi constant text := $x$'abandoned', COUNT(*) FILTER (WHERE status::text = 'abandoned')$x$;
  new_kpi constant text := $x$'abandoned', COUNT(*) FILTER (WHERE escalation_requested AND first_agent_response_at IS NULL AND status::text IN ('closed','abandoned'))$x$;
  old_drill constant text := $x$WHEN 'no_response' THEN ' AND escalation_requested AND first_agent_response_at IS NULL'$x$;
  new_drill constant text := $x$WHEN 'no_response' THEN ' AND escalation_requested AND first_agent_response_at IS NULL AND status::text IN (''closed'',''abandoned'')'$x$;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
  WHERE proname = 'report_overview' AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF position(old_kpi in d) = 0 THEN
    RAISE EXCEPTION 'report_overview abandoned KPI not found';
  END IF;
  EXECUTE replace(d, old_kpi, new_kpi);

  SELECT pg_get_functiondef(oid) INTO d FROM pg_proc
  WHERE proname = 'report_tickets' AND pronamespace = 'public'::regnamespace LIMIT 1;
  IF position(old_drill in d) = 0 THEN
    RAISE EXCEPTION 'report_tickets no_response flag not found';
  END IF;
  EXECUTE replace(d, old_drill, new_drill);
END
$do$;
