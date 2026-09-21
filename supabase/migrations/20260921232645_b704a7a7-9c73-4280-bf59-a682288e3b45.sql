-- Moved helpers are still called as public.<name>(...) inside function bodies.
-- Rewrite those qualified calls to private.<name>(...).
DO $$
DECLARE
  r record;
  def text;
  newdef text;
  h text;
  names text[] := ARRAY[
    'can_access_org','can_reply_conversation','can_view_contact','can_view_conversation_id',
    'can_view_conversation','can_view_intake','current_org_id','current_rank','effective_user',
    'has_perm','is_org_admin','is_org_member','is_platform_admin','is_super_admin','mfa_satisfied',
    'my_department_ids','org_role_of','org_role_rank','platform_can'
  ];
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig, n.nspname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
      )
  LOOP
    def := pg_get_functiondef(r.oid);
    newdef := def;
    FOREACH h IN ARRAY names LOOP
      newdef := replace(newdef, 'public.' || h || '(', 'private.' || h || '(');
    END LOOP;
    -- Wrapper functions in public intentionally delegate; skip no-op rewrites.
    IF newdef IS DISTINCT FROM def THEN
      EXECUTE newdef;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';