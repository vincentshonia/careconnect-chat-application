CREATE TABLE public.ringcentral_bot_auth (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  singleton boolean NOT NULL DEFAULT true,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  refresh_expires_at timestamptz,
  bot_extension_id text,
  bot_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ringcentral_bot_auth_singleton_chk CHECK (singleton),
  CONSTRAINT ringcentral_bot_auth_singleton_key UNIQUE (singleton)
);

GRANT ALL ON public.ringcentral_bot_auth TO service_role;

ALTER TABLE public.ringcentral_bot_auth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No client access to ringcentral bot auth"
  ON public.ringcentral_bot_auth FOR ALL
  TO authenticated, anon
  USING (false) WITH CHECK (false);