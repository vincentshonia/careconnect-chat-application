-- 1. Lock down SECURITY DEFINER functions from direct API execution
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_knowledge(uuid, uuid, vector, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bump_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_access_org(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_rank() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.role_rank(public.app_role) FROM PUBLIC, anon;

-- Policies evaluate these as the querying role, so authenticated must retain EXECUTE
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_org(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_rank() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_org_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.role_rank(public.app_role) TO authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_access_org(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_knowledge(uuid, uuid, vector, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(text, integer, integer) TO service_role;

-- 2. Block privilege escalation through user_roles writes
DROP POLICY IF EXISTS roles_write ON public.user_roles;
CREATE POLICY roles_write ON public.user_roles
  FOR ALL TO authenticated
  USING (
    can_access_org(organization_id)
    AND current_rank() >= 4
    AND public.role_rank(role) <= public.current_rank()
  )
  WITH CHECK (
    can_access_org(organization_id)
    AND current_rank() >= 4
    AND public.role_rank(role) <= public.current_rank()
  );