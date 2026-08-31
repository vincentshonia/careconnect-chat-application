import { createFileRoute } from "@tanstack/react-router";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [
      { title: "Audit Log — Pacific Health Group Support Console" },
      { name: "description", content: "Immutable record of staff and system actions across the platform." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuditPageRoute,
});

type AuditRow = Database["public"]["Tables"]["audit_logs"]["Row"];

function AuditPageRoute() {
  return (
    <RequirePermission permission="audit.view" title="Audit log">
      <AuditPage />
    </RequirePermission>
  );
}

function AuditPage() {
  const [search, setSearch] = useState("");

  const logs = useQuery({
    queryKey: ["audit-logs"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const rows = (logs.data ?? []).filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [r.action, r.record_type, r.actor_name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <AdminShell
      title="Audit log"
      description="Append-only history of configuration and record changes. Entries cannot be edited or deleted."
      actions={
        <>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by action, record, or person"
            className="w-72"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                "audit-log",
                rows.map((r) => ({
                  created_at: r.created_at,
                  actor: r.actor_name ?? "System",
                  action: r.action,
                  record_type: r.record_type ?? "",
                  record_id: r.record_id ?? "",
                  previous_value: r.previous_value ?? "",
                  new_value: r.new_value ?? "",
                })),
              )
            }
          >
            Export CSV
          </Button>
        </>
      }

    >
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Actor</th>
              <th className="px-4 py-2 font-medium">Action</th>
              <th className="px-4 py-2 font-medium">Record</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">{r.actor_name ?? "System"}</td>
                <td className="px-4 py-2">
                  <Badge variant="outline">{r.action}</Badge>
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {r.record_type ?? "—"}
                  {r.record_id ? ` · ${r.record_id.slice(0, 8)}` : ""}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {logs.isLoading ? "Loading…" : "No audit entries recorded yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
