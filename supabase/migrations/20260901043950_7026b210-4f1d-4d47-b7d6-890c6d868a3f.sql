CREATE OR REPLACE FUNCTION public.quality_summary(_org uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ratings_total', (SELECT count(*) FROM public.conversation_ratings r WHERE r.organization_id = _org),
    'csat', (
      SELECT round(avg(r.score) * 20)
      FROM public.conversation_ratings r WHERE r.organization_id = _org
    ),
    'positive_rate', (
      SELECT round(100.0 * count(*) FILTER (WHERE r.score >= 4) / NULLIF(count(*), 0))
      FROM public.conversation_ratings r WHERE r.organization_id = _org
    ),
    'reviews_total', (SELECT count(*) FROM public.qa_reviews q WHERE q.organization_id = _org),
    'avg_qa', (
      SELECT round(avg(q.overall_score)::numeric, 1)
      FROM public.qa_reviews q WHERE q.organization_id = _org
    ),
    'flagged_total', (
      SELECT count(*) FROM public.qa_reviews q WHERE q.organization_id = _org AND q.flagged
    )
  )
  WHERE public.can_access_org(_org);
$$;

REVOKE ALL ON FUNCTION public.quality_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quality_summary(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_conversation_ratings_org_created
  ON public.conversation_ratings (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_reviews_org_created
  ON public.qa_reviews (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_faqs_org_sort
  ON public.faqs (organization_id, sort_order, id);