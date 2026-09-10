ALTER TABLE public.ai_responses
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid;

CREATE INDEX IF NOT EXISTS idx_ai_responses_review
  ON public.ai_responses (organization_id, created_at DESC)
  WHERE reviewed_at IS NULL;

-- Grouped review queue: one row per distinct question (normalized), newest first.
CREATE OR REPLACE FUNCTION public.ai_review_queue(
  _org uuid,
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  question_key text,
  question text,
  answer text,
  confidence numeric,
  visitor_feedback text,
  ai_response_id uuid,
  occurrences bigint,
  last_asked_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT
      lower(regexp_replace(btrim(r.question), '\s+', ' ', 'g')) AS question_key,
      r.*
    FROM public.ai_responses r
    WHERE r.organization_id = _org
      AND r.created_at >= now() - interval '30 days'
      AND r.reviewed_at IS NULL
      AND (COALESCE(r.confidence, 0) < 0.5 OR r.visitor_feedback = 'negative')
  ),
  grouped AS (
    SELECT DISTINCT ON (c.question_key)
      c.question_key,
      c.question,
      c.answer,
      c.confidence,
      c.visitor_feedback,
      c.id AS ai_response_id,
      count(*) OVER (PARTITION BY c.question_key) AS occurrences,
      max(c.created_at) OVER (PARTITION BY c.question_key) AS last_asked_at
    FROM candidates c
    ORDER BY c.question_key, c.created_at DESC
  )
  SELECT
    g.question_key,
    g.question,
    g.answer,
    g.confidence,
    g.visitor_feedback,
    g.ai_response_id,
    g.occurrences,
    g.last_asked_at,
    count(*) OVER () AS total_count
  FROM grouped g
  ORDER BY g.last_asked_at DESC
  LIMIT greatest(_limit, 1) OFFSET greatest(_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.ai_review_queue(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_review_queue(uuid, int, int) TO authenticated, service_role;