import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  Activity,
  Bell,
  Bot,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Contact,
  BarChart3,
  Globe,
  Inbox,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  Moon,
  Sun,

  Settings,
  ShieldCheck,
  Shuffle,
  Star,
  UserCog,
  Users,
  Users2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/use-notifications";
import { useWaitingCount } from "@/hooks/use-waiting-count";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTheme } from "@/hooks/use-theme";
import type { Permission, PlatformPermission } from "@/lib/permissions";

import { Button } from "@/components/ui/button";

/**
 * Navigation is permission-driven: an item only renders when the signed-in
 * member holds at least one of its permissions. Route guards and RLS enforce
 * the same rules, so hiding here is purely for clarity.
 */
const navGroups = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perms: undefined },
      { to: "/inbox", label: "Inbox", icon: Inbox, perms: ["conversation.view_assigned"] },
      { to: "/intake", label: "Intake", icon: ClipboardList, perms: ["workflow.view_assigned"] },
      { to: "/contacts", label: "Contacts", icon: Contact, perms: ["contact.view_related"] },
      { to: "/notifications", label: "Notifications", icon: Bell, perms: undefined },
      { to: "/profile", label: "My settings", icon: UserCog, perms: undefined },

    ],
  },
  {
    label: "Content & AI",
    items: [
      { to: "/knowledge", label: "Knowledge", icon: LibraryBig, perms: ["knowledge.read"] },
      { to: "/ai-console", label: "AI console", icon: Bot, perms: ["knowledge.edit"] },
      { to: "/quality", label: "Quality & QA", icon: Star, perms: ["reports.team"] },
      {
        to: "/reports",
        label: "Reports",
        icon: BarChart3,
        perms: ["reports.team", "reports.organization", "reports.platform"],
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      { to: "/websites", label: "Websites", icon: Globe, perms: ["website.manage"] },
      { to: "/departments", label: "Departments", icon: Users2, perms: ["department.manage"] },
      { to: "/routing", label: "Routing", icon: Shuffle, perms: ["routing.manage"] },
      { to: "/staff", label: "Staff", icon: Users, perms: ["staff.view"] },
      {
        to: "/organizations",
        label: "Organizations",
        icon: Building2,
        perms: ["organization.manage", "platform.tenant_admin"],
      },
      { to: "/settings", label: "Organization settings", icon: Settings, perms: ["settings.manage"] },
      { to: "/security", label: "Security", icon: ShieldCheck, perms: ["security.manage"] },
      { to: "/audit", label: "Audit log", icon: Activity, perms: ["audit.view"] },
    ],
  },
] as const satisfies readonly {
  label: string;
  items: readonly { to: string; label: string; icon: typeof Inbox; perms?: readonly (Permission | PlatformPermission)[] }[];
}[];


export function AdminShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { unread } = useNotifications({ alerts: true });
  const { count: waitingCount } = useWaitingCount();
  const { theme, toggle: toggleTheme } = useTheme();
  const session = useSessionContext();
  const orgId = session.data?.organizationId ?? null;
  const branding = useQuery({
    queryKey: ["org-branding", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("organizations")
        .select("name, logo_url")
        .eq("id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const permissions = session.data?.permissions;
  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) => !item.perms || item.perms.some((p: string) => permissions?.has(p)),
      ),
    }))
    .filter((group) => group.items.length > 0);

  const orgName = branding.data?.name ?? "Pacific Health";
  const logoUrl = branding.data?.logo_url ?? null;
  const initials = orgName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");




  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <aside
      className={`sidebar-aurora flex h-full flex-col border-r border-sidebar-border text-sidebar-foreground transition-[width] duration-200 ${
        collapsed ? "w-[74px]" : "w-[248px]"
      }`}
    >
      <div className="px-4 py-5">
        {/* The uploaded brand logo stands in for the organization name. Without
            one, the name is rendered as text instead. "Support Console" always
            sits underneath. */}
        <Link to="/" className="flex min-w-0 flex-col gap-1.5">
          {collapsed ? (
            logoUrl ? (
              <img
                src={logoUrl}
                alt={`${orgName} logo`}
                className="h-9 w-9 shrink-0 rounded-xl bg-sidebar-accent/40 object-contain p-0.5"
              />
            ) : (
              <span className="gradient-brand grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-sidebar-primary-foreground shadow-glow">
                {initials || "PH"}
              </span>
            )
          ) : (
            <>
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={orgName}
                  className="h-9 w-auto max-w-[184px] self-start object-contain object-left"
                />
              ) : (
                <span className="block truncate text-base font-semibold tracking-tight">
                  {orgName}
                </span>
              )}
              <span className="block truncate text-[11px] text-sidebar-foreground/60">
                Support Console
              </span>
            </>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {visibleGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const badge =
                  item.to === "/notifications" || item.to === "/inbox" ? waitingCount : 0;
                return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                      collapsed ? "justify-center" : ""
                    }`}
                    activeProps={{
                      className:
                        "gradient-brand text-sidebar-primary-foreground font-semibold shadow-glow hover:text-sidebar-primary-foreground",
                    }}

                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {badge > 0 && (
                      <span
                        aria-label={`${badge} conversations waiting for a response`}
                        className={`grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground ${
                          collapsed ? "absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1" : "ml-auto"
                        }`}
                      >
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border p-3">
        <button
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {theme === "dark" ? (
            <Sun className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          ) : (
            <Moon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          )}
          {!collapsed && <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>}
        </button>
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={`hidden w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex ${
            collapsed ? "justify-center" : ""
          }`}
        >
          {collapsed ? (
            <ChevronsRight className="h-[18px] w-[18px]" aria-hidden="true" />
          ) : (
            <ChevronsLeft className="h-[18px] w-[18px]" aria-hidden="true" />
          )}
          {!collapsed && <span>Collapse</span>}
        </button>

        <button
          onClick={signOut}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="app-canvas flex min-h-screen w-full text-foreground">
      <div className="sticky top-0 hidden h-screen shrink-0 md:block">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-foreground/40"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full w-[248px] shadow-float">{sidebar}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border surface-glass">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 sm:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                aria-label="Open navigation"
                onClick={() => setMobileOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-gradient-brand truncate text-lg font-semibold tracking-tight sm:text-xl">
                  {title}
                </h1>

                {description ? (
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link
                to="/notifications"
                aria-label={unread.length ? `${unread.length} unread notifications` : "Notifications"}
                className="relative grid h-9 w-9 place-items-center rounded-xl border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <Bell className="h-4 w-4" />
                {unread.length > 0 && (
                  <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                    {unread.length > 9 ? "9+" : unread.length}
                  </span>
                )}
              </Link>
              {actions}
            </div>

          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
