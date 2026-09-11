# Admin hub: one place for every setup page

Today the sidebar lists eight separate setup pages under "Configuration". This replaces that group with a single **Admin** item that opens one page with tabs across the top — Websites, Departments & hours, Routing & templates, Staff, Organization settings, Security, Audit log, and Organizations for those who manage more than one organization.

Nothing inside those pages changes: same content, same buttons, same rules about who can see what. Only where they live changes.

## What staff will see

- Sidebar: "Configuration" disappears; a single **Admin** item sits in its own group below Content & AI. It only appears for people who can manage at least one of those areas, and it highlights whenever you are anywhere in Admin.
- The Admin page opens on the first tab you are allowed to see. Each tab has its own web address (`/admin?tab=staff`), so tabs can be bookmarked, shared and opened from a link. On a narrow screen the tab strip scrolls sideways.
- Old links keep working. `/websites`, `/departments`, `/routing`, `/staff`, `/settings`, `/security`, `/audit` and `/organizations` each send you straight to the matching tab, so old bookmarks, notification links and the staff manuals stay valid.
- A tab you lack permission for is simply not shown, exactly as the sidebar items behaved.

## Status strip

Above the tabs, people who can manage organization settings get four at-a-glance values, each one a link to the tab that fixes it:

1. Members in the default department (a zero here means routing fails).
2. "Two-step verification required for admins" — on or off.
3. Live website in test mode — on or off.
4. Scheduled jobs — the latest result of each background job.

These come from one small server call that reuses the existing scheduled-jobs check; the strip is hidden for anyone without settings access.

## Technical notes

- `src/components/admin/AdminShell.tsx`: drop the `Configuration` group; add a group holding one item `{ to: "/admin", label: "Admin", icon: Settings2, perms: [website.manage, department.manage, routing.manage, staff.view, organization.manage, platform.tenant_admin, settings.manage, security.manage, audit.view] }`. Active state uses `activeOptions={{ exact: false }}` so any `/admin` path highlights it; collapsed mode keeps the `title` tooltip. Badges, collapse, theme toggle and sign out are untouched. Update the group comment to say "Admin → <tab>".
- Panel extraction: in `websites.tsx`, `departments.tsx`, `routing.tsx`, `staff.tsx`, `settings.tsx`, `security.tsx`, `audit.tsx`, `organizations.tsx`, export the existing page body as `WebsitesPanel` etc., with the `<AdminShell>` wrapper removed and its `title`/`description`/`actions` moved into the panel's own header markup so the tab keeps the same wording. Helper components stay where they are. No logic, query, styling or copy changes inside the panels.
- New `src/routes/_authenticated/admin.tsx`: `validateSearch` parses `tab` against the tab id union, falling back to the first tab the member can see; the component renders shadcn `Tabs` with `value` from the search param and `onValueChange` calling `navigate({ search: { tab }, replace: true })` — a search-param update, not a route change. Each `TabsContent` renders the panel wrapped in the same `RequirePermission` gate the old route used. `head()` gives the page its own title and `robots: noindex`.
- Old routes keep their files but become redirects: `beforeLoad: () => { throw redirect({ to: "/admin", search: { tab: "websites" } }) }`, one per route. Their `head()` blocks are dropped since they no longer render.
- New `adminStatusFn` in `src/lib/admin.functions.ts`, guarded by `settings.manage`, returning default-department id/name/member count, `require_mfa_for_admins`, the production website's `dev_mode`, and the cron rows already produced by `cronHealthFn` reduced to the last status code per job. The Admin page queries it with TanStack Query; the strip renders only when the call is permitted.
- Docs and training: replace "Configuration → X" with "Admin → X" in `src/lib/training/content/*.ts` (mainly `configuration.ts` and `common.ts`), the training figures where the sidebar is illustrated, then regenerate `docs/staff-manuals/*.md` with the existing export script so the manuals match. `tests/e2e/*` currently contains no links to the old paths, so the Playwright specs need no change unless the run shows otherwise.
- Verification: typecheck, unit tests, and the smoke E2E spec; then a Playwright screenshot of the new sidebar and the Admin page.
