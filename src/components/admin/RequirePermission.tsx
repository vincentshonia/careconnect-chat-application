import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useSessionContext } from "@/hooks/use-session-context";
import type { Permission } from "@/lib/permissions";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";

/**
 * Route-level guard. The database and server functions are the real security
 * boundary; this keeps people out of screens they cannot use.
 */
export function RequirePermission({
  permission,
  anyOf,
  title,
  description,
  children,
}: {
  permission?: Permission;
  anyOf?: Permission[];
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const session = useSessionContext();
  const needed = anyOf ?? (permission ? [permission] : []);

  if (session.isLoading) {
    return (
      <AdminShell title={title} description={description}>
        <p className="text-sm text-muted-foreground">Checking your access…</p>
      </AdminShell>
    );
  }

  const allowed = needed.some((p) => session.data?.permissions.has(p));
  if (allowed) return <>{children}</>;

  return (
    <AdminShell title="Access restricted">
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 text-base font-semibold">You don't have access to this area</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Your current role doesn't include permission to view {title.toLowerCase()}. Ask an
          administrator in your organization if you need it.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </AdminShell>
  );
}
