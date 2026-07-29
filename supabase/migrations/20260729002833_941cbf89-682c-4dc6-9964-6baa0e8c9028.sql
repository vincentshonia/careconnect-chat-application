CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'sla-first-response-check',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--7c742686-2fdb-4c35-ac0a-f41ff9b5c193.lovable.app/api/public/hooks/sla-check',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_bnVX-ZJ2E4VujinJ35JWaQ_RVzxLnrt"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);