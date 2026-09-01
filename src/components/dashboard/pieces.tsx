/** Dashboard-specific presentation pieces. */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { fmtMin, fmtNum } from "@/components/reports/primitives";

export type Json = Record<string, unknown>;

export function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function maybe(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Compact KPI tile. Every tile is a link — no dead cards. */
export function Kpi({
  label,
  value,
  hint,
  tone = "default",
  to,
  search,
  tooltip,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "warn" | "critical" | "good";
  to?: string;
  search?: Record<string, string>;
  tooltip?: string;
  loading?: boolean;
}) {
  const toneClass =
    tone === "critical"
      ? "border-destructive/50 bg-destructive/5"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/5"
        : tone === "good"
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-card";
  const valueClass =
    tone === "critical" ? "text-destructive" : tone === "good" ? "text-primary" : "text-foreground";

  const body = (
    <div
      className={`flex h-full flex-col justify-between rounded-xl border p-4 transition-colors ${toneClass} ${
        to ? "hover:border-primary/60" : ""
      }`}
    >
      <p
        className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
        title={tooltip}
      >
        {label}
        {tooltip ? <span className="text-muted-foreground/70">ⓘ</span> : null}
      </p>
      {loading ? (
        <div className="mt-3 h-7 w-16 animate-pulse rounded bg-muted" />
      ) : (
        <p className={`mt-2 text-2xl font-semibold tabular-nums ${valueClass}`}>{value}</p>
      )}
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );

  if (!to) return body;
  return (
    <Link to={to} search={search as never} className="block h-full">
      {body}
    </Link>
  );
}

/** Metric with a comparison against the previous period. */
export function Delta({
  current,
  previous,
  lowerIsBetter = false,
  unit = "",
  formatter,
}: {
  current: number | null;
  previous: number | null;
  lowerIsBetter?: boolean;
  unit?: string;
  formatter?: (v: number | null) => string;
}) {
  const fmt = formatter ?? ((v: number | null) => (v === null ? "—" : `${fmtNum(v)}${unit}`));
  if (current === null || previous === null || previous === 0) {
    return <span className="text-xs text-muted-foreground">{fmt(current)}</span>;
  }
  const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
  if (pct === 0) return <span className="text-xs text-muted-foreground">No change</span>;
  const improved = lowerIsBetter ? pct < 0 : pct > 0;
  return (
    <span className={`text-xs ${improved ? "text-primary" : "text-muted-foreground"}`}>
      {pct > 0 ? "↑" : "↓"} {Math.abs(pct)}% vs previous
    </span>
  );
}

export function MetricRow({
  label,
  value,
  tooltip,
  delta,
}: {
  label: string;
  value: ReactNode;
  tooltip?: string;
  delta?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="text-sm text-muted-foreground" title={tooltip}>
        {label}
        {tooltip ? <span className="ml-1 text-muted-foreground/70">ⓘ</span> : null}
      </span>
      <span className="text-right">
        <span className="block text-sm font-semibold tabular-nums">{value}</span>
        {delta ? <span className="block">{delta}</span> : null}
      </span>
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl border border-border bg-muted/40" />
      ))}
    </div>
  );
}

export function age(minutes: unknown): string {
  const m = maybe(minutes);
  if (m === null) return "—";
  return fmtMin(m);
}
