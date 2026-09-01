import { useState } from "react";

export type WidgetPreviewConfig = {
  chatbotName?: string | null;
  organizationName?: string | null;
  welcomeMessage?: string | null;
  triggerMessage?: string | null;
  privacyDisclaimer?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  position?: string | null;
};

/**
 * Live, non-functional visual preview of the chat widget. Renders from the
 * in-progress form state so admins see colour/copy changes before saving.
 */
export function WidgetPreview({ config }: { config: WidgetPreviewConfig }) {
  const [open, setOpen] = useState(true);
  const brand = config.primaryColor?.trim() || "#1d4ed8";
  const accent = config.accentColor?.trim() || brand;
  const left = config.position === "bottom-left";

  return (
    <div
      className={`pointer-events-none fixed bottom-6 z-40 flex flex-col items-end gap-3 ${
        left ? "left-6 items-start" : "right-6"
      }`}
    >
      {open ? (
        <div className="pointer-events-auto w-[340px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <header
            className="relative flex items-center gap-3 px-4 py-3.5 text-white"
            style={{
              background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 68%, black))`,
            }}
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 ring-2 ring-white/25">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
              </svg>
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

          <div className="space-y-3 bg-background px-4 py-4">
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
              {config.privacyDisclaimer?.trim() ||
                "By continuing you agree to our privacy practices."}
            </p>
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-card px-3 py-2.5">
            <div className="flex-1 rounded-full border border-input px-3 py-1.5 text-[11px] text-muted-foreground">
              Type your message…
            </div>
            <span
              className="grid h-8 w-8 place-items-center rounded-full text-white"
              style={{ background: brand }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m22 2-7 20-4-9-9-4Z" />
              </svg>
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5">
            <span className="text-[10px] text-muted-foreground">Live preview — not interactive</span>
            <button
              type="button"
              className="pointer-events-auto text-[10px] font-semibold text-muted-foreground hover:text-foreground"
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
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    </div>
  );
}
