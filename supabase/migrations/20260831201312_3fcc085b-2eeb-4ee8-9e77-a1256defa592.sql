ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS require_mfa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_mfa_for_admins boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.organizations.require_mfa IS 'When true every member of this organization must complete a second factor before reaching the console.';
COMMENT ON COLUMN public.organizations.require_mfa_for_admins IS 'When true administrators and super admins must complete a second factor even if org-wide enforcement is off.';

-- Read-only helper so the console can resolve enforcement for the signed-in user
-- without exposing other organizations' settings.
CREATE OR REPLACE FUNCTION public.mfa_requirement(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(bool_or(
    o.require_mfa
    OR (o.require_mfa_for_admins AND m.role IN ('administrator','super_admin'))
  ), false)
  FROM public.organization_memberships m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = _user_id AND m.status = 'active'
$$;

REVOKE ALL ON FUNCTION public.mfa_requirement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_requirement(uuid) TO authenticated, service_role;