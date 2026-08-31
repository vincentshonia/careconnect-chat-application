DROP FUNCTION IF EXISTS public.mfa_requirement(uuid);

CREATE OR REPLACE FUNCTION public.my_mfa_requirement()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(bool_or(
    o.require_mfa
    OR (o.require_mfa_for_admins AND m.role IN ('administrator','super_admin'))
  ), false)
  FROM public.organization_memberships m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid() AND m.status = 'active'
$$;

REVOKE ALL ON FUNCTION public.my_mfa_requirement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_mfa_requirement() TO authenticated, service_role;