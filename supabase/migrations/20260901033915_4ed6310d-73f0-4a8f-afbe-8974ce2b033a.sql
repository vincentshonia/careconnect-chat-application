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
  ),
  scored AS (
    SELECT
      mem.user_id,
      COALESCE(p.full_name, 'Unnamed') AS full_name,
      mem.role,
      COALESCE(p.presence, 'offline') AS presence,
      COALESCE(
        (SELECT array_agg(d.name ORDER BY d.name)
           FROM public.department_members dm
           JOIN public.departments d ON d.id = dm.department_id
          WHERE dm.user_id = mem.user_id AND dm.organization_id = _org),
        '{}'::text[]) AS department_names,
      COALESCE(
        (SELECT true FROM public.department_members dm, conv
          WHERE dm.user_id = mem.user_id
            AND dm.organization_id = _org
            AND conv.department_id IS NOT NULL
            AND dm.department_id = conv.department_id
          LIMIT 1),
        (SELECT conv.department_id IS NULL FROM conv),
        false) AS in_department,
      COALESCE(w.n, 0) AS active_chats,
      COALESCE(p.max_concurrent_chats, 0) AS capacity,
      p.status AS profile_status
    FROM members mem
    JOIN public.profiles p ON p.id = mem.user_id AND p.organization_id = _org
    LEFT JOIN workload w ON w.user_id = mem.user_id
  )
  SELECT
    s.user_id,
    s.full_name,
    s.role,
    s.presence,
    s.department_names,
    s.in_department,
    s.active_chats,
    s.capacity,
    s.profile_status = 'active'
      AND s.presence = 'available'
      AND (s.capacity = 0 OR s.active_chats < s.capacity) AS eligible,
    CASE
      WHEN s.profile_status <> 'active' THEN 'Account is not active'
      WHEN s.presence <> 'available' THEN 'Not available'
      WHEN s.capacity > 0 AND s.active_chats >= s.capacity THEN 'At capacity'
      ELSE NULL
    END AS reason
  FROM scored s
  WHERE s.in_department
  ORDER BY 9 DESC, 2;
$$;

REVOKE ALL ON FUNCTION public.reassignment_candidates(uuid, uuid) FROM PUBLIC, anon, authenticated;