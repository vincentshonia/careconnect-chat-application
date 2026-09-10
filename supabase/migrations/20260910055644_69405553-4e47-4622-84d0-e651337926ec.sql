DO $$
DECLARE def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'report_overview';

  def := replace(def,
    '''abandoned'', COUNT(*) FILTER (WHERE escalation_requested AND claimed_at IS NULL AND status::text IN (''closed'',''archived''))',
    '''abandoned'', COUNT(*) FILTER (WHERE status::text = ''abandoned'')');

  EXECUTE def;
END $$;