DROP POLICY IF EXISTS air_review_select ON public.ai_responses;
CREATE POLICY air_review_select ON public.ai_responses FOR SELECT TO authenticated
  USING (public.has_perm(organization_id, 'knowledge.edit'));

DROP POLICY IF EXISTS air_review_update ON public.ai_responses;
CREATE POLICY air_review_update ON public.ai_responses FOR UPDATE TO authenticated
  USING (public.has_perm(organization_id, 'knowledge.edit'))
  WITH CHECK (public.has_perm(organization_id, 'knowledge.edit'));