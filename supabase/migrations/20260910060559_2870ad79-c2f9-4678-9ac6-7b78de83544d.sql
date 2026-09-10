DO $mig$
DECLARE d text;
BEGIN
  -- ---------- report_volume ----------
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'report_volume';

  d := replace(d, '_priority text DEFAULT NULL::text)', '_priority text DEFAULT NULL::text, _tz text DEFAULT ''America/Los_Angeles'')');
  d := replace(d, 'date_trunc(''day'', created_at)', 'date_trunc(''day'', created_at AT TIME ZONE _tz)');
  d := replace(d, 'EXTRACT(HOUR FROM created_at)', 'EXTRACT(HOUR FROM created_at AT TIME ZONE _tz)');
  d := replace(d, 'EXTRACT(DOW FROM created_at)', 'EXTRACT(DOW FROM created_at AT TIME ZONE _tz)');

  DROP FUNCTION IF EXISTS public.report_volume(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text);
  EXECUTE d;

  -- ---------- report_sla ----------
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'report_sla';

  d := replace(d, '_sla integer DEFAULT 15)', '_sla integer DEFAULT 15, _tz text DEFAULT ''America/Los_Angeles'')');
  d := replace(d, 'date_trunc(''day'', t.created_at)', 'date_trunc(''day'', t.created_at AT TIME ZONE _tz)');
  d := replace(d, 'EXTRACT(HOUR FROM t.created_at)', 'EXTRACT(HOUR FROM t.created_at AT TIME ZONE _tz)');

  DROP FUNCTION IF EXISTS public.report_sla(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer);
  EXECUTE d;

  -- ---------- dashboard_metrics ----------
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'dashboard_metrics';

  d := replace(d, '_sla integer DEFAULT 15)', '_sla integer DEFAULT 15, _tz text DEFAULT ''America/Los_Angeles'')');
  -- "Today" and "overdue" mean the local day, not the UTC day.
  d := replace(d, 'date_trunc(''day'', now())', '(date_trunc(''day'', now() AT TIME ZONE _tz) AT TIME ZONE _tz)');
  d := replace(d, 'i.due_date < current_date', 'i.due_date < (now() AT TIME ZONE _tz)::date');
  -- Trend buckets and their labels follow the local clock.
  d := replace(d, 'date_trunc(bucket, _from)', '(date_trunc(bucket, _from AT TIME ZONE _tz) AT TIME ZONE _tz)');
  d := replace(d, 'date_trunc(bucket, _to)', '(date_trunc(bucket, _to AT TIME ZONE _tz) AT TIME ZONE _tz)');
  d := replace(d, 'date_trunc(bucket, x.at)', '(date_trunc(bucket, x.at AT TIME ZONE _tz) AT TIME ZONE _tz)');
  d := replace(d, 'date_trunc(bucket, coalesce(c.resolved_at, c.closed_at))', '(date_trunc(bucket, coalesce(c.resolved_at, c.closed_at) AT TIME ZONE _tz) AT TIME ZONE _tz)');
  d := replace(d, 'date_trunc(bucket, c.first_agent_response_at)', '(date_trunc(bucket, c.first_agent_response_at AT TIME ZONE _tz) AT TIME ZONE _tz)');
  d := replace(d, 'to_char(b.b, CASE', 'to_char(b.b AT TIME ZONE _tz, CASE');
  -- Same queue start as the report_* functions so the two screens agree.
  d := replace(d, 'coalesce(c.first_human_requested_at, c.created_at)', 'coalesce(c.first_human_requested_at, c.requested_agent_at, c.created_at)');

  DROP FUNCTION IF EXISTS public.dashboard_metrics(uuid, uuid, uuid[], text, timestamptz, timestamptz, timestamptz, timestamptz, integer);
  EXECUTE d;
END
$mig$;

REVOKE ALL ON FUNCTION public.report_volume(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.report_sla(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_metrics(uuid, uuid, uuid[], text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_volume(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.report_sla(uuid, timestamptz, timestamptz, uuid[], uuid[], text[], uuid, text, text, text, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics(uuid, uuid, uuid[], text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text) TO service_role;