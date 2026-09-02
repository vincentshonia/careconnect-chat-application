/**
 * Interface illustration kit.
 *
 * The Training Center shows annotated diagrams of the real console rather than
 * captured screenshots, so the material stays correct when branding, tenant
 * data or theme change. Every piece is built from the same design tokens as the
 * live UI, is responsive, and prints cleanly.
 */
import type { ReactNode } from "react";

export function Marker({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`gradient-brand inline-grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold leading-none text-sidebar-primary-foreground shadow-glow ${className}`}
    >
      {n}
    </span>
  );
}

/** Browser-style chrome wrapped around a screen illustration. */
export function MockFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-panel">
      <div className="flex items-center gap-2 border-b border-border bg-muted/60 px-3 py-2">
        <span className="flex gap-1" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-destructive/50" />
          <span className="h-2 w-2 rounded-full bg-warning/60" />
          <span className="h-2 w-2 rounded-full bg-success/60" />
        </span>
        <span className="truncate rounded-md bg-background px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="bg-background">{children}</div>
    </div>
  );
}

export function MockSidebar({
  active,
  items,
  marker,
}: {
  active: string;
  items: readonly string[];
  marker?: number;
}) {
  return (
    <div className="sidebar-aurora hidden w-[132px] shrink-0 flex-col gap-2 p-2 text-sidebar-foreground sm:flex">
      <div className="flex items-center gap-1.5 px-1 py-1">
        {marker ? <Marker n={marker} /> : null}
        <span className="truncate text-[10px] font-semibold">Pacific Health</span>
      </div>
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li
            key={item}
            className={`truncate rounded-lg px-2 py-1 text-[10px] ${
              item === active
                ? "gradient-brand font-semibold text-sidebar-primary-foreground"
                : "text-sidebar-foreground/70"
            }`}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MockTopbar({
  title,
  description,
  marker,
  actions,
}: {
  title: string;
  description?: string;
  marker?: number;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 border-b border-border px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-foreground">
          {marker ? <Marker n={marker} /> : null}
          <span className="truncate">{title}</span>
        </p>
        {description ? (
          <p className="truncate text-[9px] text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
  );
}

/** Full screen: optional left navigation, page header, then page body. */
export function MockScreen({
  nav,
  navActive,
  navMarker,
  title,
  description,
  titleMarker,
  actions,
  children,
}: {
  nav?: readonly string[];
  navActive?: string;
  navMarker?: number;
  title: string;
  description?: string;
  titleMarker?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[220px]">
      {nav ? <MockSidebar items={nav} active={navActive ?? ""} marker={navMarker} /> : null}
      <div className="min-w-0 flex-1">
        <MockTopbar
          title={title}
          description={description}
          marker={titleMarker}
          actions={actions}
        />
        <div className="space-y-2 p-3">{children}</div>
      </div>
    </div>
  );
}

export function MockPanel({
  title,
  description,
  marker,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  marker?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border bg-card p-2 ${className}`}>
      {title ? (
        <div className="mb-1.5 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold text-foreground">
              {marker ? <Marker n={marker} /> : null}
              <span className="truncate">{title}</span>
            </p>
            {description ? (
              <p className="truncate text-[9px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 gap-1">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function MockStat({
  label,
  value,
  hint,
  tone = "default",
  marker,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warn" | "good";
  marker?: number;
}) {
  const toneClass =
    tone === "warn" ? "text-destructive" : tone === "good" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-2 py-1.5">
      <p className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-muted-foreground">
        {marker ? <Marker n={marker} /> : null}
        <span className="truncate">{label}</span>
      </p>
      <p className={`text-sm font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="truncate text-[8px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function MockStatRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">{children}</div>;
}

export function MockTable({
  head,
  rows,
  marker,
}: {
  head: readonly string[];
  rows: readonly (readonly string[])[];
  marker?: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full table-fixed border-collapse text-[9px]">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className="truncate px-1.5 py-1 text-left font-medium">
                <span className="flex items-center gap-1">
                  {marker && i === 0 ? <Marker n={marker} /> : null}
                  <span className="truncate">{h}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border">
              {row.map((cell, j) => (
                <td key={j} className="truncate px-1.5 py-1 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MockPills({
  items,
  active,
  marker,
}: {
  items: readonly string[];
  active?: string;
  marker?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {marker ? <Marker n={marker} /> : null}
      {items.map((item) => (
        <span
          key={item}
          className={`rounded-md border px-1.5 py-0.5 text-[9px] ${
            item === active
              ? "gradient-brand border-transparent font-semibold text-sidebar-primary-foreground"
              : "border-border bg-card text-muted-foreground"
          }`}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function MockButton({
  children,
  tone = "primary",
  marker,
}: {
  children: ReactNode;
  tone?: "primary" | "outline" | "danger";
  marker?: number;
}) {
  const cls =
    tone === "primary"
      ? "gradient-brand border-transparent text-sidebar-primary-foreground"
      : tone === "danger"
        ? "border-destructive/40 bg-destructive/10 text-destructive"
        : "border-border bg-card text-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-medium ${cls}`}
    >
      {marker ? <Marker n={marker} /> : null}
      {children}
    </span>
  );
}

export function MockBadge({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "muted" | "warn" | "good";
}) {
  const cls =
    tone === "warn"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : tone === "good"
        ? "border-success/40 bg-success/10 text-success"
        : tone === "muted"
          ? "border-border bg-muted text-muted-foreground"
          : "border-primary/40 bg-primary/10 text-primary";
  return (
    <span className={`rounded-full border px-1.5 py-[1px] text-[8px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function MockField({
  label,
  value,
  marker,
  hint,
}: {
  label: string;
  value: string;
  marker?: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-muted-foreground">
        {marker ? <Marker n={marker} /> : null}
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-0.5 block truncate rounded-md border border-input bg-background px-1.5 py-1 text-[9px] text-foreground">
        {value}
      </span>
      {hint ? <span className="block text-[8px] text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function MockList({
  items,
  activeIndex = 0,
  marker,
}: {
  items: readonly { title: string; meta?: string; badge?: string }[];
  activeIndex?: number;
  marker?: number;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
      {items.map((item, i) => (
        <li
          key={item.title}
          className={`px-2 py-1.5 ${i === activeIndex ? "bg-accent/60" : "bg-card"}`}
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="flex min-w-0 items-center gap-1 text-[9px] font-medium text-foreground">
              {marker && i === 0 ? <Marker n={marker} /> : null}
              <span className="truncate">{item.title}</span>
            </span>
            {item.badge ? <MockBadge tone="muted">{item.badge}</MockBadge> : null}
          </div>
          {item.meta ? (
            <p className="truncate text-[8px] text-muted-foreground">{item.meta}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function MockBubbles({
  messages,
  marker,
}: {
  messages: readonly { from: "visitor" | "agent" | "ai"; text: string }[];
  marker?: number;
}) {
  return (
    <div className="space-y-1.5">
      {messages.map((m, i) => (
        <div
          key={i}
          className={`max-w-[85%] rounded-lg px-2 py-1 text-[9px] ${
            m.from === "visitor"
              ? "bg-muted text-foreground"
              : m.from === "agent"
                ? "ml-auto bg-primary text-primary-foreground"
                : "border border-border bg-card text-foreground"
          }`}
        >
          <span className="mb-0.5 flex items-center gap-1 text-[8px] opacity-70">
            {marker && i === 0 ? <Marker n={marker} /> : null}
            {m.from === "visitor" ? "Visitor" : m.from === "agent" ? "You" : "CareConnect AI"}
          </span>
          {m.text}
        </div>
      ))}
    </div>
  );
}

export function MockColumns({ children }: { children: ReactNode }) {
  return <div className="grid gap-2 md:grid-cols-2">{children}</div>;
}
