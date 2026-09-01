/** Shared presentation pieces for the reporting console. */
import type { ReactNode } from "react";

export function fmtNum(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${rounded.toLocaleString()}${suffix}`;
}

/** Minutes → human duration, the unit every timing metric is stored in. */
export function fmtMin(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const m = Number(value);
  if (Number.isNaN(m)) return "—";
  if (m < 1) return `${Math.round(m * 60)}s`;
  if (m < 60) return `${Math.round(m)}m`;
  if (m < 1440) return `${Math.round((m / 60) * 10) / 10}h`;
  return `${Math.round((m / 1440) * 10) / 10}d`;
}

export function fmtDate(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  onDrill,
  drillLabel,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warn" | "good";
  /** Opens the exact rows behind this number. */
  onDrill?: () => void;
  drillLabel?: string;
}) {
  const toneClass =
    tone === "warn" ? "text-destructive" : tone === "good" ? "text-primary" : "text-foreground";
  const body = (
    <>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  if (!onDrill) return <div className="rounded-xl border border-border bg-card p-4">{body}</div>;
  return (
    <button
      type="button"
      onClick={onDrill}
      title={drillLabel ?? `Show the ${label.toLowerCase()} behind this number`}
      className="rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
      <span className="mt-2 block text-[11px] font-medium text-primary">View the {drillLabel ?? "records"} →</span>
    </button>
  );
}


export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-card p-4 ${className}`}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function DataTable({
  columns,
  rows,
  empty = "No data for this period.",
  onRowClick,
  sort,
  onSort,
}: {
  columns: { key: string; label: string; align?: "right"; sortable?: boolean; render?: (row: Record<string, unknown>) => ReactNode }[];
  rows: Record<string, unknown>[];
  empty?: string;
  onRowClick?: (row: Record<string, unknown>) => void;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
}) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`px-2 py-2 font-medium ${c.align === "right" ? "text-right" : ""} ${
                  c.sortable && onSort ? "cursor-pointer select-none hover:text-foreground" : ""
                }`}
                onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
              >
                {c.label}
                {sort?.key === c.key ? <span className="ml-1">{sort.dir === "asc" ? "↑" : "↓"}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={String(row['id'] ?? row['user_id'] ?? row['department_id'] ?? i)}
              className={`border-b border-border/60 last:border-0 ${
                onRowClick ? "cursor-pointer hover:bg-muted/60" : ""
              }`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-2 py-2 ${c.align === "right" ? "text-right tabular-nums" : ""}`}>
                  {c.render ? c.render(row) : fmtNum(row[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Compact horizontal bar list for distributions. */
export function BarList({
  rows,
  emptyLabel = "No data yet.",
}: {
  rows: { label: string; value: number; hint?: string }[];
  emptyLabel?: string;
}) {
  const peak = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-4 text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3 text-sm">
          <span className="w-40 shrink-0 truncate text-muted-foreground" title={r.label}>
            {r.label}
          </span>
          <div className="h-2 flex-1 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(r.value / peak) * 100}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right tabular-nums">{r.hint ?? r.value.toLocaleString()}</span>
        </li>
      ))}
    </ul>
  );
}

/** Simple column chart used for day/hour trends. */
export function ColumnChart({
  data,
  labelKey,
  valueKey,
  height = 160,
}: {
  data: Record<string, unknown>[];
  labelKey: string;
  valueKey: string;
  height?: number;
}) {
  const peak = Math.max(1, ...data.map((d) => Number(d[valueKey] ?? 0)));
  if (!data.length) return <p className="py-6 text-sm text-muted-foreground">No activity in this period.</p>;
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {data.map((d, i) => {
          const v = Number(d[valueKey] ?? 0);
          return (
            <div
              key={`${String(d[labelKey])}-${i}`}
              className="flex flex-1 flex-col justify-end"
              title={`${String(d[labelKey])}: ${v}`}
            >
              <div
                className="w-full rounded-t bg-primary/80"
                style={{ height: `${(v / peak) * 100}%`, minHeight: v ? 4 : 1 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>{String(data[0]?.[labelKey] ?? "")}</span>
        <span>{String(data[data.length - 1]?.[labelKey] ?? "")}</span>
      </div>
    </div>
  );
}
