-- 1. Private schema for internal access-control helpers -----------------------
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- 2. Move SECURITY DEFINER helpers out of the API-exposed public schema.
--    Policies reference these by OID, so they keep working after the move.
ALTER FUNCTION public.can_access_org(uuid) SET SCHEMA private;
ALTER FUNCTION public.can_reply_conversation(uuid) SET SCHEMA private;
ALTER FUNCTION public.can_view_contact(uuid, uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_view_conversation(uuid, uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_view_conversation_id(uuid) SET SCHEMA private;
ALTER FUNCTION public.can_view_intake(uuid, uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.current_org_id() SET SCHEMA private;
ALTER FUNCTION public.current_rank() SET SCHEMA private;
ALTER FUNCTION public.effective_user(uuid) SET SCHEMA private;
ALTER FUNCTION public.has_perm(uuid, text, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_org_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_org_member(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_platform_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_super_admin() SET SCHEMA private;
ALTER FUNCTION public.mfa_satisfied(uuid) SET SCHEMA private;
ALTER FUNCTION public.my_department_ids(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.org_role_of(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.org_role_rank(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.platform_can(text, uuid) SET SCHEMA private;
ALTER FUNCTION public.platform_role_of(uuid) SET SCHEMA private;
ALTER FUNCTION public.intake_stage_counts(uuid, text, text, uuid) SET SCHEMA private;
ALTER FUNCTION public.quality_summary(uuid) SET SCHEMA private;
ALTER FUNCTION public.staff_directory(uuid, text, app_role, uuid, text, integer, integer) SET SCHEMA private;

-- 3. Project-owned functions must still resolve the moved helpers by name.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, private', r.sig);
  END LOOP;
END $$;

-- 4. Thin SECURITY INVOKER wrappers keep the four RPCs the app calls available
--    without exposing a SECURITY DEFINER function in the API schema.
CREATE OR REPLACE FUNCTION public.platform_role_of(_user uuid DEFAULT auth.uid())
RETURNS platform_role LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.platform_role_of(_user) $$;

CREATE OR REPLACE FUNCTION public.quality_summary(_org uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.quality_summary(_org) $$;

CREATE OR REPLACE FUNCTION public.intake_stage_counts(
  _org uuid, _type text DEFAULT NULL::text, _search text DEFAULT NULL::text, _dept uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.intake_stage_counts(_org, _type, _search, _dept) $$;

CREATE OR REPLACE FUNCTION public.staff_directory(
  _org uuid, _search text DEFAULT NULL::text, _role app_role DEFAULT NULL::app_role,
  _dept uuid DEFAULT NULL::uuid, _status text DEFAULT NULL::text,
  _limit integer DEFAULT 25, _offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, private
AS $$ SELECT private.staff_directory(_org, _search, _role, _dept, _status, _limit, _offset) $$;

REVOKE EXECUTE ON FUNCTION public.platform_role_of(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.quality_summary(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.intake_stage_counts(uuid, text, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.staff_directory(uuid, text, app_role, uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_role_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.quality_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.intake_stage_counts(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_directory(uuid, text, app_role, uuid, text, integer, integer) TO authenticated;

-- 5. Explicit, org-scoped policy for the private chat-attachments bucket.
DROP POLICY IF EXISTS "Staff read chat attachments for visible conversations" ON storage.objects;
CREATE POLICY "Staff read chat attachments for visible conversations"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.organization_id::text = split_part(storage.objects.name, '/', 1)
      AND c.id::text = split_part(storage.objects.name, '/', 2)
      AND private.can_view_conversation_id(c.id)
  )
);

NOTIFY pgrst, 'reload schema';