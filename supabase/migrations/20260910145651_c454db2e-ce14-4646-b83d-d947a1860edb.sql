REVOKE ALL ON FUNCTION public.match_knowledge(uuid, uuid, vector, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_chunks(uuid, text, uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.match_knowledge(uuid, uuid, vector, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_chunks(uuid, text, uuid, uuid, uuid, jsonb) TO service_role;