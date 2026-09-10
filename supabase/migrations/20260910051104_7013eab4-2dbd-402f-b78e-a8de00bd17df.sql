DROP POLICY org_delete ON public.organizations;
DROP POLICY org_insert ON public.organizations;

CREATE POLICY org_delete ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_platform_admin());

CREATE POLICY org_insert ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY bh_write ON public.business_hours;
CREATE POLICY bh_write ON public.business_hours
  FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'department.manage'))
  WITH CHECK (public.has_perm(organization_id, 'department.manage'));

DROP POLICY hol_write ON public.holidays;
CREATE POLICY hol_write ON public.holidays
  FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'department.manage'))
  WITH CHECK (public.has_perm(organization_id, 'department.manage'));

DROP POLICY svc_write ON public.services;
CREATE POLICY svc_write ON public.services
  FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'settings.manage'))
  WITH CHECK (public.has_perm(organization_id, 'settings.manage'));

DROP POLICY tpl_write ON public.response_templates;
CREATE POLICY tpl_write ON public.response_templates
  FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'workflow.manage'))
  WITH CHECK (public.has_perm(organization_id, 'workflow.manage'));

DROP POLICY vis_write ON public.visitors;
CREATE POLICY vis_read_dept ON public.visitors
  FOR SELECT TO authenticated
  USING (public.has_perm(organization_id, 'conversation.view_department'));