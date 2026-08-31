-- =====================================================================
-- 1. Backfill memberships so organization_memberships is authoritative
-- =====================================================================
INSERT INTO public.organization_memberships (organization_id, user_id, role, status, accepted_at)
SELECT DISTINCT ON (p.organization_id, ur.user_id)
       p.organization_id, ur.user_id, ur.role, 'active'::membership_status, now()
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
WHERE p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.user_id = ur.user_id AND m.organization_id = p.organization_id)
ORDER BY p.organization_id, ur.user_id, public.role_rank(ur.role) DESC;

-- Never demote below the legacy role (protects the existing super admin).
UPDATE public.organization_memberships m
SET role = ur.role
FROM (
  SELECT user_id, role FROM public.user_roles ur1
  WHERE public.role_rank(ur1.role) = (
    SELECT MAX(public.role_rank(ur2.role)) FROM public.user_roles ur2 WHERE ur2.user_id = ur1.user_id)
) ur
WHERE m.user_id = ur.user_id
  AND m.status = 'active'
  AND public.role_rank(ur.role) > public.role_rank(m.role);

-- =====================================================================
-- 2. Permission bundles
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_perms_read ON public.role_permissions;
CREATE POLICY role_perms_read ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.platform_role_permissions (
  role public.platform_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);
GRANT SELECT ON public.platform_role_permissions TO authenticated;
GRANT ALL ON public.platform_role_permissions TO service_role;
ALTER TABLE public.platform_role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plat_perms_read ON public.platform_role_permissions;
CREATE POLICY plat_perms_read ON public.platform_role_permissions FOR SELECT TO authenticated USING (true);

DELETE FROM public.role_permissions;
INSERT INTO public.role_permissions (role, permission) VALUES
  ('agent','conversation.view_assigned'),('agent','conversation.reply'),('agent','conversation.close'),
  ('agent','workflow.view_assigned'),('agent','task.view_assigned'),('agent','contact.view_related'),
  ('agent','knowledge.read'),('agent','reports.self'),

  ('team_lead','conversation.view_assigned'),('team_lead','conversation.reply'),('team_lead','conversation.close'),
  ('team_lead','conversation.view_department'),('team_lead','conversation.assign'),('team_lead','conversation.transfer'),
  ('team_lead','workflow.view_assigned'),('team_lead','workflow.view_team'),('team_lead','task.view_assigned'),
  ('team_lead','task.manage_team'),('team_lead','contact.view_related'),('team_lead','contact.view_department'),
  ('team_lead','knowledge.read'),('team_lead','reports.self'),('team_lead','reports.team'),('team_lead','staff.view'),

  ('manager','conversation.view_assigned'),('manager','conversation.reply'),('manager','conversation.close'),
  ('manager','conversation.view_department'),('manager','conversation.assign'),('manager','conversation.transfer'),
  ('manager','workflow.view_assigned'),('manager','workflow.view_team'),('manager','workflow.manage'),
  ('manager','task.view_assigned'),('manager','task.manage_team'),('manager','contact.view_related'),
  ('manager','contact.view_department'),('manager','contact.edit'),('manager','knowledge.read'),
  ('manager','knowledge.create'),('manager','knowledge.edit'),('manager','knowledge.publish'),
  ('manager','reports.self'),('manager','reports.team'),('manager','staff.view'),

  ('administrator','conversation.view_assigned'),('administrator','conversation.reply'),('administrator','conversation.close'),
  ('administrator','conversation.view_department'),('administrator','conversation.view_all'),
  ('administrator','conversation.assign'),('administrator','conversation.transfer'),
  ('administrator','workflow.view_assigned'),('administrator','workflow.view_team'),('administrator','workflow.view_all'),
  ('administrator','workflow.manage'),('administrator','task.view_assigned'),('administrator','task.manage_team'),
  ('administrator','contact.view_related'),('administrator','contact.view_department'),('administrator','contact.view_all'),
  ('administrator','contact.edit'),('administrator','knowledge.read'),('administrator','knowledge.create'),
  ('administrator','knowledge.edit'),('administrator','knowledge.publish'),('administrator','knowledge.delete'),
  ('administrator','staff.view'),('administrator','staff.create'),('administrator','staff.edit'),
  ('administrator','staff.disable'),('administrator','staff.remove'),('administrator','role.manage'),
  ('administrator','website.manage'),('administrator','department.manage'),('administrator','routing.manage'),
  ('administrator','settings.manage'),('administrator','audit.view'),('administrator','integration.manage'),
  ('administrator','reports.self'),('administrator','reports.team'),('administrator','reports.organization'),

  ('super_admin','conversation.view_assigned'),('super_admin','conversation.reply'),('super_admin','conversation.close'),
  ('super_admin','conversation.view_department'),('super_admin','conversation.view_all'),
  ('super_admin','conversation.assign'),('super_admin','conversation.transfer'),
  ('super_admin','workflow.view_assigned'),('super_admin','workflow.view_team'),('super_admin','workflow.view_all'),
  ('super_admin','workflow.manage'),('super_admin','task.view_assigned'),('super_admin','task.manage_team'),
  ('super_admin','contact.view_related'),('super_admin','contact.view_department'),('super_admin','contact.view_all'),
  ('super_admin','contact.edit'),('super_admin','knowledge.read'),('super_admin','knowledge.create'),
  ('super_admin','knowledge.edit'),('super_admin','knowledge.publish'),('super_admin','knowledge.delete'),
  ('super_admin','staff.view'),('super_admin','staff.create'),('super_admin','staff.edit'),
  ('super_admin','staff.disable'),('super_admin','staff.remove'),('super_admin','role.manage'),
  ('super_admin','role.manage_admins'),('super_admin','website.manage'),('super_admin','department.manage'),
  ('super_admin','routing.manage'),('super_admin','settings.manage'),('super_admin','security.manage'),
  ('super_admin','audit.view'),('super_admin','integration.manage'),('super_admin','organization.manage'),
  ('super_admin','reports.self'),('super_admin','reports.team'),('super_admin','reports.organization');

DELETE FROM public.platform_role_permissions;
INSERT INTO public.platform_role_permissions (role, permission) VALUES
  ('platform_owner','platform.manage'),('platform_owner','platform.tenant_admin'),
  ('platform_owner','platform.support_access'),('platform_owner','platform.billing'),
  ('platform_owner','platform.roles_manage'),('platform_owner','reports.platform'),
  ('platform_admin','platform.tenant_admin'),('platform_admin','platform.support_access'),
  ('platform_admin','platform.roles_manage'),('platform_admin','reports.platform'),
  ('platform_support','platform.support_access'),('platform_support','reports.platform'),
  ('platform_billing','platform.billing'),('platform_billing','reports.platform'),
  ('platform_read_only','reports.platform');

-- =====================================================================
-- 3. Authorization helper functions (membership-authoritative)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.platform_role_of(_user uuid DEFAULT auth.uid())
RETURNS public.platform_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.platform_admins WHERE user_id = _user LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.platform_can(_perm text, _user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa
    JOIN public.platform_role_permissions prp ON prp.role = pa.role
    WHERE pa.user_id = _user AND prp.permission = _perm);
$$;

-- Only owner/admin count as platform administrators; billing/support/read-only do not.
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.platform_can('platform.tenant_admin', _user);
$$;

CREATE OR REPLACE FUNCTION public.org_role_of(_org uuid, _user uuid DEFAULT auth.uid())
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.role FROM public.organization_memberships m
  WHERE m.user_id = _user AND m.organization_id = _org AND m.status = 'active' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_rank()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(public.role_rank(m.role)), 0)
  FROM public.organization_memberships m
  WHERE m.user_id = auth.uid() AND m.status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_memberships m
    WHERE m.user_id = auth.uid() AND m.status = 'active' AND m.role = 'super_admin');
$$;

-- Permission check inside a tenant.
CREATE OR REPLACE FUNCTION public.has_perm(_org uuid, _perm text, _user uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _org IS NOT NULL AND (
    public.platform_can('platform.tenant_admin', _user)
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships m
      JOIN public.role_permissions rp ON rp.role = m.role
      WHERE m.user_id = _user AND m.organization_id = _org
        AND m.status = 'active' AND rp.permission = _perm));
$$;

CREATE OR REPLACE FUNCTION public.my_department_ids(_org uuid, _user uuid DEFAULT auth.uid())
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(dm.department_id), '{}')
  FROM public.department_members dm
  WHERE dm.user_id = _user AND dm.organization_id = _org;
$$;

-- Record-level conversation visibility.
CREATE OR REPLACE FUNCTION public.can_view_conversation(_org uuid, _dept uuid, _assigned uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _org IS NULL THEN false
    WHEN public.has_perm(_org, 'conversation.view_all') THEN true
    WHEN NOT public.is_org_member(_org) THEN false
    WHEN _assigned = auth.uid() THEN true
    WHEN public.has_perm(_org, 'conversation.view_department')
      THEN _dept IS NOT NULL AND _dept = ANY(public.my_department_ids(_org))
    ELSE _assigned IS NULL
      AND (_dept IS NULL OR _dept = ANY(public.my_department_ids(_org)))
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_conversation_id(_conversation uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = _conversation
      AND public.can_view_conversation(c.organization_id, c.department_id, c.assigned_to));
$$;

-- Record-level intake visibility (same shape).
CREATE OR REPLACE FUNCTION public.can_view_intake(_org uuid, _dept uuid, _assigned uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _org IS NULL THEN false
    WHEN public.has_perm(_org, 'workflow.view_all') THEN true
    WHEN NOT public.is_org_member(_org) THEN false
    WHEN _assigned = auth.uid() THEN true
    WHEN public.has_perm(_org, 'workflow.view_team')
      THEN _dept IS NOT NULL AND _dept = ANY(public.my_department_ids(_org))
    ELSE _assigned IS NULL
      AND (_dept IS NULL OR _dept = ANY(public.my_department_ids(_org)))
  END;
$$;

-- Contacts: related-record access for standard users.
CREATE OR REPLACE FUNCTION public.can_view_contact(_org uuid, _contact uuid, _owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _org IS NULL THEN false
    WHEN public.has_perm(_org, 'contact.view_all') THEN true
    WHEN NOT public.is_org_member(_org) THEN false
    WHEN _owner = auth.uid() THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.contact_id = _contact
        AND public.can_view_conversation(c.organization_id, c.department_id, c.assigned_to))
      OR EXISTS (
        SELECT 1 FROM public.intake_requests i
        WHERE i.contact_id = _contact
          AND public.can_view_intake(i.organization_id, i.department_id, i.assigned_to))
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_can(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_perm(uuid, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_conversation(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_conversation_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_intake(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_view_contact(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_department_ids(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_role_of(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.platform_role_of(uuid) FROM anon;

-- =====================================================================
-- 4. Record-level RLS
-- =====================================================================
DROP POLICY IF EXISTS conv_select ON public.conversations;
DROP POLICY IF EXISTS conv_write ON public.conversations;
CREATE POLICY conv_select ON public.conversations FOR SELECT TO authenticated
  USING (public.can_view_conversation(organization_id, department_id, assigned_to));
CREATE POLICY conv_update ON public.conversations FOR UPDATE TO authenticated
  USING (public.can_view_conversation(organization_id, department_id, assigned_to))
  WITH CHECK (public.can_view_conversation(organization_id, department_id, assigned_to));
CREATE POLICY conv_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY conv_delete ON public.conversations FOR DELETE TO authenticated
  USING (public.has_perm(organization_id, 'conversation.view_all'));

DROP POLICY IF EXISTS msg_select ON public.messages;
DROP POLICY IF EXISTS msg_write ON public.messages;
CREATE POLICY msg_select ON public.messages FOR SELECT TO authenticated
  USING (public.can_view_conversation_id(conversation_id));
CREATE POLICY msg_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (public.can_view_conversation_id(conversation_id)
              AND public.has_perm(organization_id, 'conversation.reply'));

DROP POLICY IF EXISTS note_select ON public.internal_notes;
DROP POLICY IF EXISTS note_write ON public.internal_notes;
CREATE POLICY note_select ON public.internal_notes FOR SELECT TO authenticated
  USING (public.can_view_conversation_id(conversation_id));
CREATE POLICY note_insert ON public.internal_notes FOR INSERT TO authenticated
  WITH CHECK (public.can_view_conversation_id(conversation_id) AND author_id = auth.uid());
CREATE POLICY note_delete ON public.internal_notes FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_perm(organization_id, 'conversation.view_all'));

DROP POLICY IF EXISTS cev_select ON public.conversation_events;
DROP POLICY IF EXISTS cev_insert ON public.conversation_events;
CREATE POLICY cev_select ON public.conversation_events FOR SELECT TO authenticated
  USING (public.can_view_conversation_id(conversation_id));
CREATE POLICY cev_insert ON public.conversation_events FOR INSERT TO authenticated
  WITH CHECK (public.can_view_conversation_id(conversation_id));

DROP POLICY IF EXISTS "Staff read org ratings" ON public.conversation_ratings;
DROP POLICY IF EXISTS "Staff manage org ratings" ON public.conversation_ratings;
CREATE POLICY ratings_select ON public.conversation_ratings FOR SELECT TO authenticated
  USING (public.can_view_conversation_id(conversation_id));

DROP POLICY IF EXISTS air_select ON public.ai_responses;
DROP POLICY IF EXISTS air_write ON public.ai_responses;
CREATE POLICY air_select ON public.ai_responses FOR SELECT TO authenticated
  USING (conversation_id IS NULL
           AND public.has_perm(organization_id, 'reports.organization')
         OR public.can_view_conversation_id(conversation_id));
CREATE POLICY air_update ON public.ai_responses FOR UPDATE TO authenticated
  USING (public.can_view_conversation_id(conversation_id))
  WITH CHECK (public.can_view_conversation_id(conversation_id));

DROP POLICY IF EXISTS "Staff read org qa reviews" ON public.qa_reviews;
DROP POLICY IF EXISTS "Staff manage org qa reviews" ON public.qa_reviews;
CREATE POLICY qa_select ON public.qa_reviews FOR SELECT TO authenticated
  USING (agent_id = auth.uid() OR reviewer_id = auth.uid()
         OR public.can_view_conversation_id(conversation_id));
CREATE POLICY qa_write ON public.qa_reviews FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'reports.team') AND public.can_view_conversation_id(conversation_id))
  WITH CHECK (public.has_perm(organization_id, 'reports.team') AND public.can_view_conversation_id(conversation_id));

DROP POLICY IF EXISTS cont_select ON public.contacts;
DROP POLICY IF EXISTS cont_write ON public.contacts;
CREATE POLICY cont_select ON public.contacts FOR SELECT TO authenticated
  USING (public.can_view_contact(organization_id, id, owner_id));
CREATE POLICY cont_insert ON public.contacts FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY cont_update ON public.contacts FOR UPDATE TO authenticated
  USING (public.can_view_contact(organization_id, id, owner_id))
  WITH CHECK (public.can_view_contact(organization_id, id, owner_id));
CREATE POLICY cont_delete ON public.contacts FOR DELETE TO authenticated
  USING (public.has_perm(organization_id, 'contact.view_all'));

DROP POLICY IF EXISTS "org staff manage intakes" ON public.intake_requests;
CREATE POLICY intake_select ON public.intake_requests FOR SELECT TO authenticated
  USING (public.can_view_intake(organization_id, department_id, assigned_to));
CREATE POLICY intake_insert ON public.intake_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY intake_update ON public.intake_requests FOR UPDATE TO authenticated
  USING (public.can_view_intake(organization_id, department_id, assigned_to))
  WITH CHECK (public.can_view_intake(organization_id, department_id, assigned_to));
CREATE POLICY intake_delete ON public.intake_requests FOR DELETE TO authenticated
  USING (public.has_perm(organization_id, 'workflow.manage'));

DROP POLICY IF EXISTS "org staff read intake events" ON public.intake_events;
DROP POLICY IF EXISTS "org staff add intake events" ON public.intake_events;
CREATE POLICY intake_ev_select ON public.intake_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.intake_requests i
                 WHERE i.id = intake_id
                   AND public.can_view_intake(i.organization_id, i.department_id, i.assigned_to)));
CREATE POLICY intake_ev_insert ON public.intake_events FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.intake_requests i
                      WHERE i.id = intake_id
                        AND public.can_view_intake(i.organization_id, i.department_id, i.assigned_to)));

-- =====================================================================
-- 5. Permission-based administrative policies
-- =====================================================================
DROP POLICY IF EXISTS audit_select ON public.audit_logs;
CREATE POLICY audit_select ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_perm(organization_id, 'audit.view'));

DROP POLICY IF EXISTS web_write ON public.websites;
CREATE POLICY web_write ON public.websites FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'website.manage'))
  WITH CHECK (public.has_perm(organization_id, 'website.manage'));

DROP POLICY IF EXISTS dept_write ON public.departments;
CREATE POLICY dept_write ON public.departments FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'department.manage'))
  WITH CHECK (public.has_perm(organization_id, 'department.manage'));

DROP POLICY IF EXISTS deptmem_write ON public.department_members;
CREATE POLICY deptmem_write ON public.department_members FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'department.manage'))
  WITH CHECK (public.has_perm(organization_id, 'department.manage'));

DROP POLICY IF EXISTS rr_write ON public.routing_rules;
CREATE POLICY rr_write ON public.routing_rules FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'routing.manage'))
  WITH CHECK (public.has_perm(organization_id, 'routing.manage'));

DROP POLICY IF EXISTS kba_write ON public.knowledge_articles;
CREATE POLICY kba_write ON public.knowledge_articles FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'knowledge.edit'))
  WITH CHECK (public.has_perm(organization_id, 'knowledge.edit'));

DROP POLICY IF EXISTS faq_write ON public.faqs;
CREATE POLICY faq_write ON public.faqs FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'knowledge.edit'))
  WITH CHECK (public.has_perm(organization_id, 'knowledge.edit'));

DROP POLICY IF EXISTS kbc_write ON public.knowledge_categories;
CREATE POLICY kbc_write ON public.knowledge_categories FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'knowledge.edit'))
  WITH CHECK (public.has_perm(organization_id, 'knowledge.edit'));

DROP POLICY IF EXISTS kbch_write ON public.knowledge_chunks;
CREATE POLICY kbch_write ON public.knowledge_chunks FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'knowledge.edit'))
  WITH CHECK (public.has_perm(organization_id, 'knowledge.edit'));

DROP POLICY IF EXISTS org_update ON public.organizations;
CREATE POLICY org_update ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_perm(id, 'settings.manage'))
  WITH CHECK (public.has_perm(id, 'settings.manage'));

DROP POLICY IF EXISTS ws_write ON public.workspaces;
CREATE POLICY ws_write ON public.workspaces FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'settings.manage'))
  WITH CHECK (public.has_perm(organization_id, 'settings.manage'));

DROP POLICY IF EXISTS prof_admin_write ON public.profiles;
CREATE POLICY prof_admin_write ON public.profiles FOR UPDATE TO authenticated
  USING (public.has_perm(organization_id, 'staff.edit'))
  WITH CHECK (public.has_perm(organization_id, 'staff.edit'));

-- =====================================================================
-- 6. No privilege writes from the browser (server functions only)
-- =====================================================================
DROP POLICY IF EXISTS roles_write ON public.user_roles;
DROP POLICY IF EXISTS "Org admins manage memberships" ON public.organization_memberships;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.organization_memberships FROM authenticated;
GRANT ALL ON public.user_roles TO service_role;
GRANT ALL ON public.organization_memberships TO service_role;