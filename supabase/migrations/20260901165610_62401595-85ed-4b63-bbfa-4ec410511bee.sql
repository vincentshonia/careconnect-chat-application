-- After a large bulk load the planner's statistics are stale, which makes the
-- reporting queries choose very slow plans until autovacuum catches up. This
-- helper lets a trusted backend/maintenance process refresh them on demand.
CREATE OR REPLACE FUNCTION public.refresh_report_statistics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ANALYZE public.conversations;
  ANALYZE public.messages;
  ANALYZE public.conversation_events;
  ANALYZE public.ai_responses;
  ANALYZE public.conversation_ratings;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_report_statistics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_report_statistics() TO service_role;