-- lovable-cron-fallback-reviewed: 288 runs/day; first-response SLA alerts must fire within ~5 minutes of the target being missed, which requires a time-based sweep; only the HTTP timeout changes here.
SELECT cron.unschedule('sla-first-response-check')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sla-first-response-check');

SELECT cron.schedule(
  'sla-first-response-check',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://project--7c742686-2fdb-4c35-ac0a-f41ff9b5c193.lovable.app/api/public/hooks/sla-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-careconnect-secret', (SELECT token FROM public.internal_tokens WHERE name = 'sla_check')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

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
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);

-- Backend-only health readout: last 12 scheduled HTTP calls, attributed to the
-- cron job whose run window contains the response. pg_net purges the request
-- queue, so attribution is by run time rather than a foreign key.
CREATE OR REPLACE FUNCTION public.cron_health()
RETURNS TABLE (
  job_name text,
  status_code integer,
  error_msg text,
  timed_out boolean,
  created timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, net, cron
AS $$
  SELECT
    j.jobname::text AS job_name,
    r.status_code,
    r.error_msg,
    r.timed_out,
    r.created
  FROM net._http_response r
  LEFT JOIN LATERAL (
    SELECT d.jobid
    FROM cron.job_run_details d
    WHERE d.start_time <= r.created
      AND r.created - d.start_time < interval '2 minutes'
    ORDER BY d.start_time DESC
    LIMIT 1
  ) run ON true
  LEFT JOIN cron.job j ON j.jobid = run.jobid
  ORDER BY r.created DESC
  LIMIT 12;
$$;

REVOKE ALL ON FUNCTION public.cron_health() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_health() TO service_role;