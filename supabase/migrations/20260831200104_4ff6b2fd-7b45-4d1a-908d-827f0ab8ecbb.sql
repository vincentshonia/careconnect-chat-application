CREATE TABLE IF NOT EXISTS public.internal_tokens (
  name text PRIMARY KEY,
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.internal_tokens FROM anon, authenticated;
GRANT ALL ON public.internal_tokens TO service_role;
ALTER TABLE public.internal_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "No direct access to internal tokens" ON public.internal_tokens;
CREATE POLICY "No direct access to internal tokens" ON public.internal_tokens
  FOR SELECT TO service_role USING (true);

INSERT INTO public.internal_tokens (name, token)
VALUES ('sla_check', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (name) DO NOTHING;

SELECT cron.unschedule('sla-first-response-check');

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
    body := '{}'::jsonb
  );
  $job$
);