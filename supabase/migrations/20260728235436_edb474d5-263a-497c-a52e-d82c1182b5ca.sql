CREATE TABLE public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rate_limits_bucket_key_idx ON public.rate_limits (bucket_key);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_rate_limit(_key text, _limit integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hits integer;
BEGIN
  INSERT INTO public.rate_limits (bucket_key, window_start, hits)
  VALUES (_key, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE
    SET hits = CASE
          WHEN public.rate_limits.window_start < now() - make_interval(secs => _window_seconds) THEN 1
          ELSE public.rate_limits.hits + 1
        END,
        window_start = CASE
          WHEN public.rate_limits.window_start < now() - make_interval(secs => _window_seconds) THEN now()
          ELSE public.rate_limits.window_start
        END
  RETURNING hits INTO v_hits;

  RETURN v_hits <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, integer, integer) TO service_role;

ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.internal_notes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notes;