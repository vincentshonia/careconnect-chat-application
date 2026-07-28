
CREATE OR REPLACE FUNCTION public.match_knowledge(
  _org uuid,
  _website uuid,
  query_embedding vector(1536),
  match_count int DEFAULT 6
)
RETURNS TABLE (
  chunk_id uuid,
  article_id uuid,
  title text,
  content text,
  source_url text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, a.id, a.title, c.content, a.source_url,
         1 - (c.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks c
  JOIN public.knowledge_articles a ON a.id = c.article_id
  WHERE c.organization_id = _org
    AND a.status = 'published'
    AND (a.applies_to_all OR _website = ANY(a.website_ids))
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
$$;

REVOKE EXECUTE ON FUNCTION public.match_knowledge(uuid, uuid, vector, int) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org uuid;
  v_first boolean;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO v_first;

  INSERT INTO public.profiles (id, full_name, email, organization_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email, v_org)
  ON CONFLICT (id) DO UPDATE SET organization_id = COALESCE(public.profiles.organization_id, v_org);

  IF v_first THEN
    INSERT INTO public.user_roles (user_id, role, organization_id) VALUES (NEW.id, 'super_admin', v_org) ON CONFLICT DO NOTHING;
    INSERT INTO public.user_roles (user_id, role, organization_id) VALUES (NEW.id, 'administrator', v_org) ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role, organization_id) VALUES (NEW.id, 'agent', v_org) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
