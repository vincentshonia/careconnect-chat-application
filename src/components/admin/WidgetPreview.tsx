import { useState } from "react";
import brandLogoAsset from "@/assets/phg-logo-light.png.asset.json";

export type WidgetPreviewConfig = {
  chatbotName?: string | null;
  organizationName?: string | null;
  logoUrl?: string | null;
  welcomeMessage?: string | null;
  triggerMessage?: string | null;
  privacyDisclaimer?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  position?: string | null;
  borderRadius?: number | null;
  homeGreeting?: string | null;
  homeHeadline?: string | null;
  homeSubtitle?: string | null;
  homeCtaTitle?: string | null;
  homeCtaSubtitle?: string | null;
  helpTitle?: string | null;
  privacyFooterText?: string | null;
  showHomeTab?: boolean | null;
  showHelpTab?: boolean | null;
  showServicesTab?: boolean | null;
  showRequestsTab?: boolean | null;
  topics?: string[];
};

const TABS = [
  { key: "home", label: "Home", icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  {
    key: "chat",
    label: "Chat",
    icon: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z",
  },
  {
    key: "help",
    label: "Help",
    icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17h0",
  },
  { key: "services", label: "Services", icon: "M4 6h16M4 12h16M4 18h10" },
  { key: "requests", label: "Requests", icon: "M9 4h6a2 2 0 0 1 2 2v14l-5-3-5 3V6a2 2 0 0 1 2-2z" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * Live, non-functional visual preview of the chat widget rendered at the same
 * size as the real embedded widget, so admins see copy/colour/tab changes as
 * they type.
 */
export function WidgetPreview({ config }: { config: WidgetPreviewConfig }) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState<TabKey>("home");
  const brand = config.primaryColor?.trim() || "#1d4ed8";
  const accent = config.accentColor?.trim() || brand;
  const left = config.position === "bottom-left";
  const radius = config.borderRadius ?? 16;
  const logo = config.logoUrl?.trim() || brandLogoAsset.url;
  const topics = (config.topics ?? []).slice(0, 4);

  const visible = TABS.filter((t) => {
    if (t.key === "home") return config.showHomeTab !== false;
    if (t.key === "help") return config.showHelpTab !== false;
    if (t.key === "services") return config.showServicesTab !== false;
    if (t.key === "requests") return config.showRequestsTab !== false;
    return true;
  });
  const activeTab = visible.some((t) => t.key === tab) ? tab : (visible[0]?.key ?? "chat");

  return (
    <div
      className={`pointer-events-none fixed bottom-6 z-40 flex flex-col gap-3 ${
        left ? "left-6 items-start" : "right-6 items-end"
      }`}
    >
      {open ? (
        <div
          className="pointer-events-auto flex h-[620px] w-[400px] flex-col overflow-hidden border border-border bg-background shadow-2xl"
          style={{ borderRadius: radius }}
        >
          <div className="flex-1 overflow-y-auto">
            {activeTab === "home" ? (
              <HomeView
                config={config}
                brand={brand}
                logo={logo}
                topics={topics}
                onClose={() => setOpen(false)}
              />
            ) : activeTab === "chat" ? (
              <ChatView config={config} brand={brand} accent={accent} />
            ) : (
              <ListView
                title={
                  activeTab === "help"
                    ? config.helpTitle?.trim() || "Search for help"
                    : activeTab === "services"
                      ? "Our services"
                      : "Your requests"
                }
                brand={brand}
                items={
                  activeTab === "requests"
                    ? ["Submit a referral", "Enrollment assistance", "Request a callback"]
                    : topics.length
                      ? topics
                      : ["Enhanced Care Management", "Community Supports", "Eligibility questions"]
                }
              />
            )}
          </div>

          {activeTab === "chat" ? (
            <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2.5">
              <div className="flex-1 rounded-full border border-input px-3 py-2 text-xs text-muted-foreground">
                Type your message…
              </div>
              <span
                className="grid h-9 w-9 place-items-center rounded-full text-white"
                style={{ background: brand }}
              >
                <Icon d="m22 2-7 20-4-9-9-4Z" size={16} />
              </span>
            </div>
          ) : null}

          <nav className="flex items-stretch gap-0.5 border-t border-border/60 bg-card px-1.5 pb-2 pt-1.5 [&>button]:flex-1">
            {visible.map((t) => {
              const isActive = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className="flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition hover:bg-muted/60"
                  style={isActive ? { color: brand } : undefined}
                >
                  <Icon d={t.icon} size={19} className={isActive ? undefined : "text-muted-foreground"} />
                  <span className={isActive ? undefined : "text-muted-foreground"}>{t.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5">
            <span className="text-[10px] text-muted-foreground">Live preview — sample content</span>
            <button
              type="button"
              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
            >
              Hide
            </button>
          </div>
        </div>
      ) : (
        <div className="pointer-events-auto rounded-full bg-card px-3 py-1.5 text-[11px] font-medium shadow-lg ring-1 ring-border">
          {config.triggerMessage?.trim() || "Hello! How can we help you today?"}
        </div>
      )}

      <button
        type="button"
        aria-label={open ? "Hide widget preview" : "Show widget preview"}
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl ring-1 ring-white/25 transition hover:-translate-y-0.5"
        style={{ background: `linear-gradient(145deg, ${brand}, color-mix(in oklab, ${brand} 72%, black))` }}
      >
        <Icon
          d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
          size={26}
        />
      </button>
    </div>
  );
}

function HomeView({
  config,
  brand,
  logo,
  topics,
  onClose,
}: {
  config: WidgetPreviewConfig;
  brand: string;
  logo: string;
  topics: string[];
  onClose: () => void;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div
        className="relative shrink-0 overflow-hidden px-5 pb-10 pt-5 text-white"
        style={{
          background: `linear-gradient(150deg, color-mix(in oklab, ${brand} 82%, black) 0%, ${brand} 52%, color-mix(in oklab, ${brand} 62%, white) 100%)`,
        }}
      >
        <div className="relative flex items-start justify-between gap-3">
          <img
            src={logo}
            alt={config.organizationName || "Organization"}
            className="h-9 w-auto max-w-[170px] object-contain object-left"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="grid h-8 w-8 place-items-center rounded-full text-base leading-none transition hover:bg-white/20"
          >
            ✕
          </button>
        </div>
        <div className="relative mt-7">
          <h3 className="text-[26px] font-semibold leading-tight tracking-tight text-white/95">
            {config.homeGreeting?.trim() || "Hi there."}
          </h3>
          <h4 className="text-[26px] font-semibold leading-tight tracking-tight text-white">
            {config.homeHeadline?.trim() || "How can we help?"}
          </h4>
          <p className="mt-2.5 text-[13px] text-white/85">
            {config.homeSubtitle?.trim() || "CareConnect AI is available anytime."}
          </p>
        </div>
      </div>

      <div className="-mt-6 flex-1 space-y-3 rounded-t-3xl bg-background px-4 pb-5 pt-4">
        <div className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-sm">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
            style={{ background: brand }}
          >
            <Icon d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-card-foreground">
              {config.homeCtaTitle?.trim() || "Send us a message"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {config.homeCtaSubtitle?.trim() || "CareConnect AI can help now, or leave a message"}
            </span>
          </span>
          <Icon d="M9 6l6 6-6 6" size={18} className="shrink-0 text-muted-foreground" />
        </div>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex w-full items-center gap-2.5">
            <Icon d="M21 21l-4.2-4.2" size={17} className="text-muted-foreground" />
            <span className="text-[15px] font-semibold text-card-foreground">
              {config.helpTitle?.trim() || "Search for help"}
            </span>
          </div>
          <div className="mt-3 divide-y divide-border/60 border-t border-border/60">
            {(topics.length
              ? topics
              : ["Enhanced Care Management", "Community Supports", "What services do you provide?"]
            ).map((t) => (
              <div key={t} className="flex items-center gap-2 py-2.5">
                <span className="min-w-0 flex-1 truncate text-[13px] text-card-foreground">{t}</span>
                <Icon d="M9 6l6 6-6 6" size={15} className="shrink-0 text-muted-foreground" />
              </div>
            ))}
          </div>
        </div>

        <p className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
          <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" size={12} />
          {config.privacyFooterText?.trim() || "Your privacy matters to us."}
        </p>
      </div>
    </div>
  );
}

function ChatView({
  config,
  brand,
  accent,
}: {
  config: WidgetPreviewConfig;
  brand: string;
  accent: string;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <header
        className="relative flex items-center gap-3 px-4 py-3.5 text-white"
        style={{
          background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 68%, black))`,
        }}
      >
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 ring-2 ring-white/25">
          <Icon d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">
            {config.chatbotName?.trim() || "PHG CareConnect Assistant"}
          </p>
          <p className="truncate text-[11px] text-white/80">
            {config.organizationName?.trim() || "Live representatives are available"}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold ring-1 ring-white/25">
          Talk to an agent
        </span>
      </header>

      <div className="flex-1 space-y-3 px-4 py-4">
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-xs text-foreground">
          {config.welcomeMessage?.trim() || "Hello! How can we help you today?"}
        </div>
        <div
          className="ml-auto max-w-[75%] rounded-2xl rounded-br-sm px-3 py-2 text-xs text-white"
          style={{ background: accent }}
        >
          I need help with enrollment.
        </div>
        <p className="pt-1 text-[10px] leading-snug text-muted-foreground">
          {config.privacyDisclaimer?.trim() || "By continuing you agree to our privacy practices."}
        </p>
      </div>
    </div>
  );
}

function ListView({ title, brand, items }: { title: string; brand: string; items: string[] }) {
  return (
    <div className="min-h-full bg-background">
      <div className="px-4 py-4 text-white" style={{ background: brand }}>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <div className="space-y-2 p-4">
        {items.map((i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-3 text-[13px] text-card-foreground"
          >
            <span className="min-w-0 flex-1 truncate">{i}</span>
            <Icon d="M9 6l6 6-6 6" size={15} className="shrink-0 text-muted-foreground" />
          </div>
        ))}
      </div>
    </div>
  );
}

function Icon({ d, size = 18, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}
