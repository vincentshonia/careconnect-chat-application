CREATE OR REPLACE FUNCTION public.mfa_satisfied(_org uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
     OR NOT EXISTS (
       SELECT 1
       FROM public.organization_memberships m
       JOIN public.organizations o ON o.id = m.organization_id
       WHERE m.user_id = auth.uid()
         AND m.status = 'active'
         AND (_org IS NULL OR m.organization_id = _org)
         AND (
           o.require_mfa
           OR (o.require_mfa_for_admins AND public.role_rank(m.role) >= 4)
         )
     );
$$;

REVOKE ALL ON FUNCTION public.mfa_satisfied(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_org(_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.mfa_satisfied(_org)
     AND (public.is_platform_admin() OR public.is_org_member(_org));
$$;