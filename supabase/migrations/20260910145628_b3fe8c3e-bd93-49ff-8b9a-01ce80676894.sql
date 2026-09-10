ALTER TABLE public.knowledge_chunks
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'article',
  ADD COLUMN IF NOT EXISTS source_id uuid,
  ADD COLUMN IF NOT EXISTS website_id uuid REFERENCES public.websites(id) ON DELETE CASCADE;

ALTER TABLE public.knowledge_chunks ALTER COLUMN article_id DROP NOT NULL;

UPDATE public.knowledge_chunks
   SET source_id = COALESCE(source_id, article_id),
       source_type = COALESCE(NULLIF(source_type, ''), 'article')
 WHERE source_id IS NULL;

ALTER TABLE public.knowledge_chunks
  DROP CONSTRAINT IF EXISTS knowledge_chunks_source_type_check;
ALTER TABLE public.knowledge_chunks
  ADD CONSTRAINT knowledge_chunks_source_type_check
  CHECK (source_type IN ('article','faq','service'));

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_chunks_source_idx
  ON public.knowledge_chunks (source_type, source_id, chunk_index);
CREATE INDEX IF NOT EXISTS knowledge_chunks_org_source_idx
  ON public.knowledge_chunks (organization_id, source_type, source_id);

DROP FUNCTION IF EXISTS public.match_knowledge(uuid, uuid, vector, int);

CREATE OR REPLACE FUNCTION public.match_knowledge(
  _org uuid,
  _website uuid,
  query_embedding vector(1536),
  match_count int DEFAULT 6
)
RETURNS TABLE (
  chunk_id uuid,
  article_id uuid,
  source_type text,
  source_id uuid,
  title text,
  content text,
  source_url text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id,
         c.article_id,
         c.source_type,
         c.source_id,
         CASE c.source_type
           WHEN 'faq' THEN 'FAQ: ' || f.question
           WHEN 'service' THEN 'Service: ' || s.name
           ELSE a.title
         END AS title,
         c.content,
         CASE c.source_type
           WHEN 'service' THEN s.learn_more_url
           WHEN 'faq' THEN NULL
           ELSE a.source_url
         END AS source_url,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks c
  LEFT JOIN public.knowledge_articles a
         ON c.source_type = 'article' AND a.id = c.source_id
  LEFT JOIN public.faqs f
         ON c.source_type = 'faq' AND f.id = c.source_id
  LEFT JOIN public.services s
         ON c.source_type = 'service' AND s.id = c.source_id
  WHERE c.organization_id = _org
    AND c.embedding IS NOT NULL
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
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_knowledge(uuid, uuid, vector, int) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.replace_chunks(
  _org uuid,
  _source_type text,
  _source_id uuid,
  _article_id uuid,
  _website_id uuid,
  _chunks jsonb
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF _source_type NOT IN ('article','faq','service') THEN
    RAISE EXCEPTION 'Invalid source_type %', _source_type;
  END IF;

  DELETE FROM public.knowledge_chunks
   WHERE source_type = _source_type AND source_id = _source_id;

  INSERT INTO public.knowledge_chunks
    (organization_id, article_id, source_type, source_id, website_id, chunk_index, content, embedding)
  SELECT _org,
         _article_id,
         _source_type,
         _source_id,
         _website_id,
         (item->>'chunk_index')::int,
         item->>'content',
         (item->>'embedding')::vector
  FROM jsonb_array_elements(COALESCE(_chunks, '[]'::jsonb)) AS item;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_chunks(uuid, text, uuid, uuid, uuid, jsonb) FROM anon, authenticated;