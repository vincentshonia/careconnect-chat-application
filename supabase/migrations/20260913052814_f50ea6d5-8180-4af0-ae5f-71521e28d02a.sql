DROP FUNCTION IF EXISTS public.match_knowledge_hybrid(uuid, uuid, vector, text, int);

CREATE OR REPLACE FUNCTION public.match_knowledge_hybrid(
  _org uuid,
  _website uuid,
  _embedding vector(1536),
  _query text,
  _k int DEFAULT 6
)
RETURNS TABLE (
  chunk_id uuid,
  article_id uuid,
  source_type text,
  source_id uuid,
  title text,
  content text,
  source_url text,
  similarity float,
  text_score float,
  ts_score float,
  trigram_score float,
  vector_rank int,
  text_rank int,
  fused_score float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH allowed AS (
    SELECT c.id,
           c.article_id,
           c.source_type,
           c.source_id,
           c.content,
           c.content_tsv,
           c.embedding,
           CASE c.source_type
             WHEN 'faq' THEN 'FAQ: ' || f.question
             WHEN 'service' THEN 'Service: ' || s.name
             ELSE a.title
           END AS title,
           CASE c.source_type
             WHEN 'service' THEN s.learn_more_url
             WHEN 'faq' THEN NULL
             ELSE a.source_url
           END AS source_url
    FROM public.knowledge_chunks c
    LEFT JOIN public.knowledge_articles a
           ON c.source_type = 'article' AND a.id = c.source_id
    LEFT JOIN public.faqs f
           ON c.source_type = 'faq' AND f.id = c.source_id
    LEFT JOIN public.services s
           ON c.source_type = 'service' AND s.id = c.source_id
    WHERE c.organization_id = _org
      AND (c.website_id IS NULL OR c.website_id = _website)
      AND (
        (c.source_type = 'article' AND a.id IS NOT NULL
          AND a.status = 'published'
          AND (a.applies_to_all OR _website = ANY(a.website_ids)))
        OR (c.source_type = 'faq' AND f.id IS NOT NULL
          AND f.status = 'active'
          AND (f.applies_to_all OR _website = ANY(f.website_ids)))
        OR (c.source_type = 'service' AND s.id IS NOT NULL
          AND s.status = 'active'
          AND (s.applies_to_all OR _website = ANY(s.website_ids)))
      )
  ),
  vec AS (
    SELECT id,
           1 - (embedding <=> _embedding) AS similarity,
           row_number() OVER (ORDER BY embedding <=> _embedding) AS rnk
    FROM allowed
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> _embedding
    LIMIT 10
  ),
  scored AS (
    SELECT id,
           CASE WHEN _query IS NULL OR btrim(_query) = '' THEN 0
                ELSE ts_rank_cd(content_tsv, websearch_to_tsquery('english', _query))
           END AS ts_score,
           CASE WHEN _query IS NULL OR btrim(_query) = '' THEN 0
                ELSE similarity(content, _query)
           END AS trigram_score
    FROM allowed
  ),
  lex AS (
    SELECT id, ts_score, trigram_score, score,
           row_number() OVER (ORDER BY score DESC) AS rnk
    FROM (
      SELECT id, ts_score, trigram_score,
             GREATEST(ts_score, trigram_score) AS score
      FROM scored
    ) z
    WHERE score > 0
    ORDER BY score DESC
    LIMIT 10
  )
  SELECT al.id,
         al.article_id,
         al.source_type,
         al.source_id,
         al.title,
         al.content,
         al.source_url,
         COALESCE(vec.similarity, 0)::float,
         COALESCE(lex.score, 0)::float,
         COALESCE(lex.ts_score, 0)::float,
         COALESCE(lex.trigram_score, 0)::float,
         COALESCE(vec.rnk, 0)::int,
         COALESCE(lex.rnk, 0)::int,
         (COALESCE(1.0 / (60 + vec.rnk), 0) + COALESCE(1.0 / (60 + lex.rnk), 0))::float AS fused_score
  FROM allowed al
  LEFT JOIN vec ON vec.id = al.id
  LEFT JOIN lex ON lex.id = al.id
  WHERE vec.id IS NOT NULL OR lex.id IS NOT NULL
  ORDER BY fused_score DESC
  LIMIT _k;
$$;

REVOKE ALL ON FUNCTION public.match_knowledge_hybrid(uuid, uuid, vector, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge_hybrid(uuid, uuid, vector, text, int) TO service_role;