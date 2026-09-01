import { createFileRoute } from "@tanstack/react-router";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useDebounced } from "@/hooks/use-debounced";
import { Pager } from "@/components/admin/Pager";
import { exportCsvFn } from "@/lib/exports.functions";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { saveCsv } from "@/lib/csv";

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

const PAGE_SIZE = 50;

/** Strip characters that would break a PostgREST `or=` expression. */
const sanitize = (term: string) => term.trim().replace(/[%,()*]/g, "").slice(0, 80);

function AuditPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const debouncedSearch = useDebounced(search, 300);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  /** Searching and paging both happen in the database. */
  const logs = useQuery({
    queryKey: ["audit-logs", debouncedSearch, page],
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase.from("audit_logs").select("*", { count: "exact" });
      const term = sanitize(debouncedSearch);
      if (term) {
        q = q.or(`action.ilike.%${term}%,actor_name.ilike.%${term}%,record_type.ilike.%${term}%`);
      }
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as AuditRow[], total: count ?? 0 };
    },
  });

  const rows = logs.data?.rows ?? [];
  const total = logs.data?.total ?? 0;

  const runExport = useServerFn(exportCsvFn);
  const exportCsv = useMutation({
    mutationFn: async () => runExport({ data: { dataset: "audit", search: debouncedSearch } }),
    onSuccess: (result) => {
      if (!result.rows) {
        toast.info("Nothing to export with this filter.");
        return;
      }
      saveCsv("audit-log", result.csv);
      toast.success(`Exported ${result.rows.toLocaleString()} entries`);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not build that export"),
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
            placeholder="Search action, record, or person"
            className="w-72"
          />
          <Button variant="outline" size="sm" disabled={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
            {exportCsv.isPending ? "Preparing…" : "Export CSV"}
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
      <Pager page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} noun="entries" busy={logs.isFetching} />
    </AdminShell>
  );
}
