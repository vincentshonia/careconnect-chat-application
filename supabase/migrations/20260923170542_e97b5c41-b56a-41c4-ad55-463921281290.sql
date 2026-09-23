-- (a) The permission matrices are internal reference data; nothing in the app
-- reads them from the browser. Remove the blanket read rule and leave no
-- direct grants to anon/authenticated.
DROP POLICY IF EXISTS role_perms_read ON public.role_permissions;
DROP POLICY IF EXISTS plat_perms_read ON public.platform_role_permissions;

REVOKE ALL ON public.role_permissions FROM anon, authenticated;
REVOKE ALL ON public.platform_role_permissions FROM anon, authenticated;
GRANT ALL ON public.role_permissions TO service_role;
GRANT ALL ON public.platform_role_permissions TO service_role;

-- (b) Narrow, audited read paths.

-- The caller's own effective permissions (organization role + platform role).
CREATE OR REPLACE FUNCTION private.my_permissions()
RETURNS TABLE(permission text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT rp.permission
  FROM public.role_permissions rp
  WHERE rp.role = private.org_role_of(auth.uid())
  UNION
  SELECT pp.permission
  FROM public.platform_role_permissions pp
  WHERE pp.role = private.platform_role_of(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TABLE(permission text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = private, public
AS $$
  SELECT * FROM private.my_permissions()
$$;

-- The whole matrix, for the roles screen only.
CREATE OR REPLACE FUNCTION private.role_matrix()
RETURNS TABLE(scope text, role text, permission text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT 'organization'::text, rp.role::text, rp.permission
  FROM public.role_permissions rp
  WHERE private.has_perm(auth.uid(), 'role.manage')
  UNION ALL
  SELECT 'platform'::text, pp.role::text, pp.permission
  FROM public.platform_role_permissions pp
  WHERE private.has_perm(auth.uid(), 'role.manage')
$$;

CREATE OR REPLACE FUNCTION public.role_matrix()
RETURNS TABLE(scope text, role text, permission text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = private, public
AS $$
  SELECT * FROM private.role_matrix()
$$;

REVOKE ALL ON FUNCTION public.my_permissions() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.role_matrix() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.role_matrix() TO authenticated;