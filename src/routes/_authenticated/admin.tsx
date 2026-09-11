import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdminShell } from "@/components/admin/AdminShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSessionContext } from "@/hooks/use-session-context";
import { adminStatusFn } from "@/lib/admin.functions";
import { LaunchReadinessCard } from "@/components/admin/LaunchReadinessCard";
import { WebsitesPanel } from "./websites";
import { DepartmentsPanel } from "./departments";
import { RoutingPanel } from "./routing";
import { StaffPanel } from "./staff";
import { SettingsPanel } from "./settings";
import { SecurityPanel } from "./security";
import { AuditPanel } from "./audit";
import { OrganizationsPanel } from "./organizations";

const TABS = [
  { id: "websites", label: "Websites", perms: ["website.manage"], render: () => <WebsitesPanel /> },
  {
    id: "departments",
    label: "Departments & hours",
    perms: ["department.manage"],
    render: () => <DepartmentsPanel />,
  },
  {
    id: "routing",
    label: "Routing & templates",
    perms: ["routing.manage"],
    render: () => <RoutingPanel />,
  },
  { id: "staff", label: "Staff", perms: ["staff.view"], render: () => <StaffPanel /> },
  {
    id: "settings",
    label: "Organization settings",
    perms: ["settings.manage"],
    render: () => (
      <>
        <LaunchReadinessCard />
        <SettingsPanel />
      </>
    ),
  },
  {
    id: "security",
    label: "Security",
    perms: ["security.manage"],
    render: () => <SecurityPanel />,
  },
  { id: "audit", label: "Audit log", perms: ["audit.view"], render: () => <AuditPanel /> },
  {
    id: "organizations",
    label: "Organizations",
    perms: ["organization.manage", "platform.tenant_admin"],
    render: () => <OrganizationsPanel />,
  },
] as const;

export type AdminTab = (typeof TABS)[number]["id"];
const TAB_IDS = TABS.map((t) => t.id) as readonly string[];

/** Anyone holding one of these sees the Admin item in the sidebar. */
export const ADMIN_PERMISSIONS = [
  "website.manage",
  "department.manage",
  "routing.manage",
  "staff.view",
  "organization.manage",
  "platform.tenant_admin",
  "settings.manage",
  "security.manage",
  "audit.view",
] as const;

export const Route = createFileRoute("/_authenticated/admin")({
  validateSearch: (search: Record<string, unknown>): { tab?: AdminTab } => {
    const tab = typeof search["tab"] === "string" ? search["tab"] : undefined;
    return tab && TAB_IDS.includes(tab) ? { tab: tab as AdminTab } : {};
  },
  head: () => ({
    meta: [
      { title: "Admin — Pacific Health Group Support Console" },
      {
        name: "description",
        content: "Websites, departments, routing, staff, settings, security and the audit log.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminHub,
});

function AdminHub() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const session = useSessionContext();
  const permissions = session.data?.permissions;

  const visible = TABS.filter((t) => t.perms.some((p: string) => permissions?.has(p)));
  const fallback = visible[0]?.id;
  const active = visible.some((t) => t.id === search.tab) ? search.tab! : fallback;

  if (!active) {
    return (
      <AdminShell title="Admin">
        <p className="text-sm text-muted-foreground">
          Your current role doesn't include access to any admin area. Ask an administrator in your
          organization if you need it.
        </p>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Admin"
      description="Everything that configures the console: websites, departments, routing, staff, settings, security and the audit log."
    >
      <AdminStatusStrip canRead={Boolean(permissions?.has("settings.manage"))} />

      <Tabs
        value={active}
        onValueChange={(tab) => navigate({ search: { tab: tab as AdminTab }, replace: true })}
        className="mt-4"
      >
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <TabsList className="w-max">
            {visible.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {visible.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-6">
            {active === t.id ? t.render() : null}
          </TabsContent>
        ))}
      </Tabs>
    </AdminShell>
  );
}

/** Four setup values that most often break routing, security or automation. */
function AdminStatusStrip({ canRead }: { canRead: boolean }) {
  const readStatus = useServerFn(adminStatusFn);
  const status = useQuery({
    queryKey: ["admin-status"],
    enabled: canRead,
    refetchOnWindowFocus: false,
    queryFn: () => readStatus({}),
  });

  if (!canRead) return null;

  const data = status.data;
  const jobs = data?.jobs ?? [];
  const jobsBad = jobs.some(
    (j) => j.timedOut || (j.statusCode ?? 0) >= 300 || j.statusCode === null,
  );

  const items: { label: string; value: string; tone: "ok" | "warn"; tab: AdminTab }[] = data
    ? [
        {
          label: "Default department",
          value: data.defaultDepartment
            ? `${data.defaultDepartment.members} member${data.defaultDepartment.members === 1 ? "" : "s"}`
            : "Not set",
          tone: data.defaultDepartment && data.defaultDepartment.members > 0 ? "ok" : "warn",
          tab: "departments",
        },
        {
          label: "Two-step for admins",
          value: data.requireMfaForAdmins ? "Required" : "Off",
          tone: data.requireMfaForAdmins ? "ok" : "warn",
          tab: "security",
        },
        {
          label: "Live website test mode",
          value: data.productionWebsite
            ? data.productionWebsite.devMode
              ? "On"
              : "Off"
            : "No live site",
          tone: data.productionWebsite && !data.productionWebsite.devMode ? "ok" : "warn",
          tab: "websites",
        },
        {
          label: "Scheduled jobs",
          value: jobs.length
            ? jobs
                .map((j) => `${j.jobName}: ${j.timedOut ? "timeout" : (j.statusCode ?? "—")}`)
                .join(" · ")
            : "No runs yet",
          tone: jobs.length && !jobsBad ? "ok" : "warn",
          tab: "settings",
        },
      ]
    : [];

  if (status.isLoading) {
    return <p className="text-sm text-muted-foreground">Checking setup…</p>;
  }
  if (status.isError || !data) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Link
          key={item.label}
          to="/admin"
          search={{ tab: item.tab }}
          className="rounded-xl border border-border bg-card p-3 transition hover:bg-accent"
        >
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
          <p
            className={`mt-1 truncate text-sm font-medium ${
              item.tone === "warn" ? "text-destructive" : "text-foreground"
            }`}
            title={item.value}
          >
            {item.value}
          </p>
        </Link>
      ))}
    </div>
  );
}
