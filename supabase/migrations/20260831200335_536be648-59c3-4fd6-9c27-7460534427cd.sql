ALTER TABLE public.websites
  ALTER COLUMN public_key SET DEFAULT ('cc_pk_' || replace(gen_random_uuid()::text, '-', '')),
  ALTER COLUMN verification_token SET DEFAULT ('careconnect-verify-' || replace(gen_random_uuid()::text, '-', ''));