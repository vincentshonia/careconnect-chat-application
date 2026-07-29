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
  Users,
  Users2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/use-notifications";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTheme } from "@/hooks/use-theme";

import { Button } from "@/components/ui/button";

const navGroups = [
  {
    label: "Workspace",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { to: "/inbox", label: "Inbox", icon: Inbox },
      { to: "/intake", label: "Intake", icon: ClipboardList },
      { to: "/contacts", label: "Contacts", icon: Contact },
      { to: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Content & AI",
    items: [
      { to: "/knowledge", label: "Knowledge", icon: LibraryBig },
      { to: "/ai-console", label: "AI console", icon: Bot },
      { to: "/quality", label: "Quality & QA", icon: Star },
      { to: "/reports", label: "Reports", icon: BarChart3 },
    ],
  },
  {
    label: "Configuration",
    items: [
      { to: "/websites", label: "Websites", icon: Globe },
      { to: "/departments", label: "Departments", icon: Users2 },
      { to: "/routing", label: "Routing", icon: Shuffle },
      { to: "/staff", label: "Staff", icon: Users },
      { to: "/organizations", label: "Organizations", icon: Building2 },
      { to: "/settings", label: "Settings", icon: Settings },
      { to: "/security", label: "Security", icon: ShieldCheck },
      { to: "/audit", label: "Audit log", icon: Activity },
    ],
  },
] as const;


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
  const { unread } = useNotifications();
  const { theme, toggle: toggleTheme } = useTheme();



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
      <div className="flex items-center gap-2.5 px-4 py-5">
        <Link to="/" className="flex min-w-0 items-center gap-2.5">
          <span className="gradient-brand grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-bold text-sidebar-primary-foreground shadow-glow">
            PH
          </span>

          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight">Pacific Health</span>
              <span className="block truncate text-[11px] text-sidebar-foreground/60">Support Console</span>
            </span>
          )}
        </Link>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {navGroups.map((group) => (
          <div key={group.label}>
            {!collapsed && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground/70 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                      collapsed ? "justify-center" : ""
                    }`}
                    activeProps={{
                      className:
                        "gradient-brand text-sidebar-primary-foreground font-semibold shadow-glow hover:text-sidebar-primary-foreground",
                    }}

                  >
                    <item.icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              ))}
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
