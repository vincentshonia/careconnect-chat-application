CREATE OR REPLACE FUNCTION public.report_ai(_org uuid, _from timestamptz, _to timestamptz, _dept uuid[] DEFAULT NULL, _website uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
WITH c AS (
  SELECT * FROM public.conversations
  WHERE organization_id=_org AND created_at >= _from AND created_at < _to
    AND (_dept IS NULL OR department_id = ANY(_dept))
    AND (_website IS NULL OR website_id = _website)
), a AS (
  -- Answers are scoped through the conversations in view, so a department or
  -- website filter can never leak answer text, confidence or ratings from
  -- outside the caller's selection.
  SELECT r.* FROM public.ai_responses r
  JOIN c ON c.id = r.conversation_id
  WHERE r.organization_id = _org
), answered AS (
  SELECT c.* FROM c WHERE EXISTS (SELECT 1 FROM a WHERE a.conversation_id = c.id)
)
SELECT jsonb_build_object(
  'conversations', (SELECT COUNT(*) FROM c),
  'ai_answers', (SELECT COUNT(*) FROM a),
  'answered_conversations', (SELECT COUNT(*) FROM answered),
  'ai_only', (SELECT COUNT(*) FROM answered
      WHERE NOT escalation_requested AND assigned_to IS NULL
        AND first_human_requested_at IS NULL AND requested_agent_at IS NULL),
  'ai_only_rate', (SELECT CASE WHEN COUNT(*) > 0 THEN ROUND(
      COUNT(*) FILTER (WHERE NOT escalation_requested AND assigned_to IS NULL
        AND first_human_requested_at IS NULL AND requested_agent_at IS NULL) * 100.0 / COUNT(*), 1)
      END FROM answered),
  'escalated', (SELECT COUNT(*) FROM answered WHERE escalation_requested),
  'escalation_rate', (SELECT CASE WHEN COUNT(*) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE escalation_requested) * 100.0 / COUNT(*), 1) END FROM answered),
  'abandoned', (SELECT COUNT(*) FROM answered
      WHERE NOT escalation_requested AND assigned_to IS NULL
        AND resolved_at IS NULL AND closed_at IS NULL),
  'avg_confidence', (SELECT ROUND(AVG(confidence)::numeric,2) FROM a),
  'low_confidence', (SELECT COUNT(*) FROM a WHERE confidence IS NOT NULL AND confidence < 0.5),
  'rated', (SELECT COUNT(*) FROM a WHERE visitor_feedback IS NOT NULL),
  'helpful', (SELECT COUNT(*) FROM a WHERE visitor_feedback = 'helpful'),
  'not_helpful', (SELECT COUNT(*) FROM a WHERE visitor_feedback = 'not_helpful'),
  'helpful_rate', (SELECT CASE WHEN COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE visitor_feedback='helpful') * 100.0
        / COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL),1) END FROM a),
  'unhelpful_rate', (SELECT CASE WHEN COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL) > 0
      THEN ROUND(COUNT(*) FILTER (WHERE visitor_feedback='not_helpful') * 100.0
        / COUNT(*) FILTER (WHERE visitor_feedback IS NOT NULL),1) END FROM a),
  'escalations_by_department', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT COALESCE(d.name,'Unassigned') AS department, COUNT(*) AS n
      FROM c LEFT JOIN public.departments d ON d.id = c.department_id
      WHERE c.escalation_requested GROUP BY 1 ORDER BY 2 DESC LIMIT 25) x), '[]'::jsonb),
  'top_questions', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT left(question, 140) AS question, COUNT(*) AS n
      FROM a GROUP BY 1 ORDER BY 2 DESC LIMIT 15) x), '[]'::jsonb),
  'low_confidence_questions', COALESCE((SELECT jsonb_agg(x) FROM (
      SELECT left(question, 140) AS question, ROUND(AVG(confidence)::numeric,2) AS confidence, COUNT(*) AS n
      FROM a WHERE confidence IS NOT NULL AND confidence < 0.5
      GROUP BY 1 ORDER BY 3 DESC LIMIT 15) x), '[]'::jsonb)
)
$$;

REVOKE ALL ON FUNCTION public.report_ai(uuid, timestamptz, timestamptz, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_ai(uuid, timestamptz, timestamptz, uuid[], uuid) TO service_role;

CREATE INDEX IF NOT EXISTS idx_ai_responses_conversation ON public.ai_responses (conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_responses_org_created ON public.ai_responses (organization_id, created_at DESC);