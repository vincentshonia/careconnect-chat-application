-- 1. Personal settings hardening -------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_email text;
BEGIN
  -- Identity is never editable.
  NEW.id := OLD.id;

  -- profiles.email mirrors the authentication email; it may never diverge.
  SELECT u.email INTO auth_email FROM auth.users u WHERE u.id = NEW.id;
  NEW.email := COALESCE(auth_email, OLD.email);

  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  IF public.has_perm(OLD.organization_id, 'staff.edit') THEN
    RETURN NEW;
  END IF;

  -- Self-service edits may not touch tenancy, authority or capacity.
  NEW.organization_id := OLD.organization_id;
  NEW.status := OLD.status;
  NEW.max_concurrent_chats := OLD.max_concurrent_chats;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_profile_self_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_profile_self_update ON public.profiles;
CREATE TRIGGER guard_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_self_update();

-- 2. Transfer / reassignment eligibility ------------------------------------
CREATE OR REPLACE FUNCTION public.reassignment_candidates(
  _org uuid,
  _conversation uuid
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  role app_role,
  presence text,
  department_names text[],
  in_department boolean,
  active_chats integer,
  capacity integer,
  eligible boolean,
  reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH conv AS (
    SELECT c.department_id
    FROM public.conversations c
    WHERE c.id = _conversation AND c.organization_id = _org
  ),
  receiving_roles AS (
    SELECT rp.role FROM public.role_permissions rp WHERE rp.permission = 'conversation.claim'
  ),
  members AS (
    SELECT m.user_id, m.role
    FROM public.organization_memberships m
    WHERE m.organization_id = _org
      AND m.status = 'active'
      AND m.role IN (SELECT role FROM receiving_roles)
  ),
  workload AS (
    SELECT c.assigned_to AS user_id, count(*)::int AS n
    FROM public.conversations c
    WHERE c.organization_id = _org
      AND c.status = ANY(public.busy_conversation_statuses())
      AND c.assigned_to IS NOT NULL
    GROUP BY c.assigned_to
  )
  SELECT
    mem.user_id,
    COALESCE(p.full_name, 'Unnamed'),
    mem.role,
    COALESCE(p.presence, 'offline'),
    COALESCE(
      (SELECT array_agg(d.name ORDER BY d.name)
         FROM public.department_members dm
         JOIN public.departments d ON d.id = dm.department_id
        WHERE dm.user_id = mem.user_id AND dm.organization_id = _org),
      '{}'::text[]),
    COALESCE(
      (SELECT true FROM public.department_members dm, conv
        WHERE dm.user_id = mem.user_id
          AND dm.organization_id = _org
          AND conv.department_id IS NOT NULL
          AND dm.department_id = conv.department_id
        LIMIT 1),
      (SELECT conv.department_id IS NULL FROM conv)),
    COALESCE(w.n, 0),
    COALESCE(p.max_concurrent_chats, 0),
    (p.status = 'active')
      AND COALESCE(
        (SELECT true FROM public.department_members dm, conv
          WHERE dm.user_id = mem.user_id
            AND dm.organization_id = _org
            AND conv.department_id IS NOT NULL
            AND dm.department_id = conv.department_id
          LIMIT 1),
        (SELECT conv.department_id IS NULL FROM conv))
      AND p.presence = 'available'
      AND (COALESCE(p.max_concurrent_chats, 0) = 0
           OR COALESCE(w.n, 0) < COALESCE(p.max_concurrent_chats, 0)),
    CASE
      WHEN p.id IS NULL OR p.status <> 'active' THEN 'Account is not active'
      WHEN COALESCE(
        (SELECT true FROM public.department_members dm, conv
          WHERE dm.user_id = mem.user_id
            AND dm.organization_id = _org
            AND conv.department_id IS NOT NULL
            AND dm.department_id = conv.department_id
          LIMIT 1),
        (SELECT conv.department_id IS NULL FROM conv)) IS NOT TRUE
        THEN 'Not in this department'
      WHEN p.presence <> 'available' THEN 'Not available'
      WHEN COALESCE(p.max_concurrent_chats, 0) > 0
       AND COALESCE(w.n, 0) >= COALESCE(p.max_concurrent_chats, 0) THEN 'At capacity'
      ELSE NULL
    END
  FROM members mem
  JOIN public.profiles p ON p.id = mem.user_id AND p.organization_id = _org
  LEFT JOIN workload w ON w.user_id = mem.user_id
  ORDER BY 9 DESC, 2;
$$;

REVOKE ALL ON FUNCTION public.reassignment_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated;