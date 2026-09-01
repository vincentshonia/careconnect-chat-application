/**
 * Shared definition of the widget's bottom navigation buttons. Admins can
 * rename, reorder, hide, and re-icon these; the defaults below are used when a
 * website has no custom `tab_config` stored.
 */
export type WidgetTabKey = "home" | "chat" | "help" | "services" | "requests";

export type WidgetTabConfig = {
  key: WidgetTabKey;
  label: string;
  icon: string;
  enabled: boolean;
};

/** Icon name -> SVG path, so configs stay data-only (no code paths in the DB). */
export const WIDGET_TAB_ICONS: Record<string, string> = {
  home: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  chat: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17h0",
  list: "M4 6h16M4 12h16M4 18h10",
  bookmark: "M9 4h6a2 2 0 0 1 2 2v14l-5-3-5 3V6a2 2 0 0 1 2-2z",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2 8 6 8-6",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  heart: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21l7.7-7.6 1.1-1a5.5 5.5 0 0 0 0-7.8z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h0",
  doc: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
};

export const DEFAULT_WIDGET_TABS: WidgetTabConfig[] = [
  { key: "home", label: "Home", icon: "home", enabled: true },
  { key: "chat", label: "Chat", icon: "chat", enabled: true },
  { key: "help", label: "Help", icon: "help", enabled: true },
  { key: "services", label: "Services", icon: "list", enabled: true },
  { key: "requests", label: "Requests", icon: "bookmark", enabled: true },
];

/** Normalizes stored config, filling gaps from the defaults. */
export function resolveWidgetTabs(raw: unknown): WidgetTabConfig[] {
  const stored = Array.isArray(raw) ? (raw as Partial<WidgetTabConfig>[]) : [];
  const byKey = new Map(stored.filter((t) => t && t.key).map((t) => [t.key as WidgetTabKey, t]));
  const ordered = stored.length
    ? stored
        .map((t) => DEFAULT_WIDGET_TABS.find((d) => d.key === t.key))
        .filter((d): d is WidgetTabConfig => Boolean(d))
    : DEFAULT_WIDGET_TABS;
  const seen = new Set<WidgetTabKey>();
  const merged: WidgetTabConfig[] = [];
  for (const def of [...ordered, ...DEFAULT_WIDGET_TABS]) {
    if (seen.has(def.key)) continue;
    seen.add(def.key);
    const custom = byKey.get(def.key);
    merged.push({
      key: def.key,
      label: (custom?.label ?? "").toString().trim() || def.label,
      icon: custom?.icon && WIDGET_TAB_ICONS[custom.icon] ? custom.icon : def.icon,
      // Chat is always reachable.
      enabled: def.key === "chat" ? true : custom?.enabled !== false,
    });
  }
  return merged;
}

export function tabIconPath(icon: string): string {
  return WIDGET_TAB_ICONS[icon] ?? WIDGET_TAB_ICONS['chat']!;
}
