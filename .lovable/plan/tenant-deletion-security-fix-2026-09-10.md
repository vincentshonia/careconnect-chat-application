# Tenant-deletion security fix

A "super admin" of one organization can currently delete a *different* organization, taking all of its data with it. This tightens the rules so only platform-level operators can create or delete organizations, and so the five remaining legacy rules judge authority per organization instead of by the person's highest rank anywhere.

## Verified current state

- `organizations` delete rule: `is_super_admin()`; insert rule: `is_super_admin()`. That function returns true if the caller is a super admin in *any* organization — no per-organization check. Confirmed.
- `is_platform_admin()` checks platform-level tenant-admin rights only. Confirmed.
- Five legacy write rules use `current_rank() >= 3` (a maximum rank across all organizations): `business_hours.bh_write`, `holidays.hol_write`, `services.svc_write`, `response_templates.tpl_write`, `visitors.vis_write`. Each is a single ALL rule paired with a read rule. Confirmed.
- `has_perm(org, permission)` already evaluates membership within one organization, and grants platform tenant-admins access. Confirmed.

## Changes (one migration, rules only)

1. Replace the organizations delete rule so only platform operators can delete an organization.
2. Replace the organizations insert rule the same way.
3. Replace the five legacy write rules with per-organization permission checks:
   - business hours, holidays -> department management right
   - services -> settings management right
   - response templates -> workflow management right
   - visitors -> read-only for people who can view their department's conversations; no client-side create/edit/delete rule (visitor records are written server-side)

Nothing else is touched: read rules, other tables, and all functions stay exactly as they are.

## Note on the visitors change

Today staff with rank 3+ can write visitor rows from the browser. After this change the browser has no write path to `visitors` at all. Server-side writes are unaffected. If any in-app screen edits visitor records directly, it would stop working — the request specifies no client write rule, so this is implemented as asked.

## Test

Add one case to `tests/rbac.test.ts`: a super admin of organization A attempts to delete organization B.

Important detail: with row-level rules, a delete the caller isn't allowed to perform doesn't raise an error — it simply matches no rows. So the test asserts the strong outcome: the delete affects zero rows *and* organization B still exists afterwards. If the rule were wrong, organization B would disappear and the test would fail. If you'd rather see a hard error instead, that needs a trigger, which is outside the scope of this change.

## Technical detail

New migration:

```sql
DROP POLICY org_delete ON public.organizations;
DROP POLICY org_insert ON public.organizations;
CREATE POLICY org_delete ON public.organizations FOR DELETE TO authenticated USING (public.is_platform_admin());
CREATE POLICY org_insert ON public.organizations FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());

DROP POLICY bh_write ON public.business_hours;
CREATE POLICY bh_write ON public.business_hours FOR ALL TO authenticated
  USING (public.has_perm(organization_id, 'department.manage'))
  WITH CHECK (public.has_perm(organization_id, 'department.manage'));
-- holidays: same, 'department.manage'
-- services: 'settings.manage'
-- response_templates: 'workflow.manage'
DROP POLICY vis_write ON public.visitors;  -- no replacement write policy
CREATE POLICY vis_read_dept ON public.visitors FOR SELECT TO authenticated
  USING (public.has_perm(organization_id, 'conversation.view_department'));
```

The existing `vis_select` read rule stays; the added department-scoped read rule is the one named in the request.

Test run: `bunx vitest run tests/rbac.test.ts`, which needs `TEST_SUPABASE_*` credentials (the suite now refuses to touch production). Result shown either way.
