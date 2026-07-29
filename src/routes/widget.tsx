import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/widget")({
  head: () => ({
    meta: [
      { title: "Chat widget" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Embedded website chat widget." },
    ],
    styles: [
      {
        children:
          "html,body,#root{background:transparent !important;margin:0;overflow:hidden;}",
      },
    ],
  }),
  component: WidgetPage,
  ssr: false,
});


type Config = {
  website: {
    id: string;
    chatbotName: string;
    welcomeMessage: string;
    triggerMessage: string;
    triggerDelaySeconds: number;
    triggerOncePerVisit: boolean;
    triggerRepeatDays: number;
    autoOpen: boolean;
    hiddenPaths: string[];
    position: string;
    primaryColor: string;
    accentColor: string;
    logoUrl: string | null;
    agentAvatarUrl: string | null;
    fontFamily: string;
    widgetSize: string;
    borderRadius: number;
    offlineMessage: string;
    privacyDisclaimer: string;
    consentLanguage: string;
    menuButtons: Array<{ key: string; label: string; icon?: string }>;
  };
  organization: {
    name: string;
    phone: string;
    email: string;
    address: string;
    privacyNotice: string;
    emergencyMessage: string;
  };
  services: Array<{
    id: string;
    name: string;
    short_description: string;
    eligibility_overview: string | null;
    counties: string[];
    health_plans: string[];
    learn_more_url: string | null;
  }>;
  faqs: Array<{ id: string; category: string; question: string; answer: string }>;
  businessOpen: boolean;
  agentsAvailable: boolean;
};

type Bubble = {
  id: string;
  role: "visitor" | "bot" | "system";
  text: string;
  sources?: Array<{ articleId: string; title: string; url: string | null }>;
  aiResponseId?: string;
  escalate?: boolean;
  author?: string;
};

type View = "menu" | "chat" | "services" | "faq" | "contact" | "form" | "waiting";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function post(type: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage({ source: "lovable-chat-widget", type, ...payload }, "*");
}

function WidgetPage() {
  const [params] = useState(() =>
    typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search),
  );
  const websiteId = params.get("w") ?? "";
  const hostOrigin = params.get("h");
  const page = params.get("p") ?? "";

  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<"live_agent" | "contact" | "referral" | "enrollment" | "message">("live_agent");
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [faqQuery, setFaqQuery] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const lastSeen = useRef<string | null>(null);

  const storageKey = `phg-widget-${websiteId}`;
  const sessionToken = useMemo(() => {
    if (typeof window === "undefined") return "";
    const key = `${storageKey}-session`;
    let token = window.localStorage.getItem(key);
    if (!token) {
      token = uid() + uid();
      window.localStorage.setItem(key, token);
    }
    return token;
  }, [storageKey]);

  /* ---------------------------- load config ---------------------------- */
  useEffect(() => {
    if (!websiteId) {
      setError("Missing website id");
      return;
    }
    fetch(`/api/public/chat/config?w=${encodeURIComponent(websiteId)}&h=${encodeURIComponent(hostOrigin ?? "")}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error ?? "Unable to load chat");
        setConfig(json as Config);
      })
      .catch((e: Error) => setError(e.message));
  }, [websiteId, hostOrigin]);

  /* ------------------- teaser / auto-open / hidden pages ---------------- */
  useEffect(() => {
    if (!config) return;
    post("position", { value: config.website.position });

    const hidden = (config.website.hiddenPaths ?? []).some((p) => p && page.startsWith(p));
    if (hidden) {
      post("hide");
      return;
    }

    const dismissedAt = Number(window.localStorage.getItem(`${storageKey}-dismissed`) ?? 0);
    const days = config.website.triggerRepeatDays || 0;
    const suppressed =
      dismissedAt > 0 && (days === 0 || Date.now() - dismissedAt < days * 86400000);

    if (config.website.autoOpen && !suppressed) {
      const t = setTimeout(() => setOpen(true), config.website.triggerDelaySeconds * 1000);
      return () => clearTimeout(t);
    }
    if (!suppressed) {
      const t = setTimeout(() => setShowTeaser(true), config.website.triggerDelaySeconds * 1000);
      return () => clearTimeout(t);
    }
  }, [config, page, storageKey]);

  useEffect(() => {
    post("resize", { open, bubble: showTeaser && !open });
  }, [open, showTeaser]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, view]);

  /* -------------------------- live agent polling ------------------------ */
  useEffect(() => {
    if (!conversationId || view !== "waiting") return;
    const tick = async () => {
      const qs = new URLSearchParams({ c: conversationId, s: sessionToken });
      if (lastSeen.current) qs.set("since", lastSeen.current);
      const res = await fetch(`/api/public/chat/poll?${qs.toString()}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.connected && data.agentName) {
        setAgentName(data.agentName);
        setLiveStatus("Representative connected");
      }
      const incoming = (data.messages ?? []).filter(
        (m: any) => m.sender_type === "agent" || m.sender_type === "ai",
      );
      if (incoming.length) {
        lastSeen.current = incoming[incoming.length - 1].created_at;
        setMessages((prev) => [
          ...prev,
          ...incoming.map((m: any) => ({
            id: m.id,
            role: "bot" as const,
            text: m.body,
            author: m.sender_name ?? "Representative",
          })),
        ]);
      }
    };
    void tick();
    const interval = setInterval(tick, 5000);
    return () => clearInterval(interval);
  }, [conversationId, view, sessionToken]);

  const brand = config?.website.primaryColor ?? "#0f766e";
  const radius = config?.website.borderRadius ?? 16;

  const openWidget = useCallback(() => {
    setOpen(true);
    setShowTeaser(false);
    if (!messages.length && config) {
      setMessages([{ id: uid(), role: "bot", text: config.website.welcomeMessage }]);
    }
  }, [messages.length, config]);

  const dismissTeaser = () => {
    setShowTeaser(false);
    window.localStorage.setItem(`${storageKey}-dismissed`, String(Date.now()));
  };

  const closeWidget = () => {
    setOpen(false);
    window.localStorage.setItem(`${storageKey}-dismissed`, String(Date.now()));
  };

  const sendQuestion = async (text: string) => {
    if (!text.trim() || !config) return;
    setView("chat");
    setInput("");
    setMessages((prev) => [...prev, { id: uid(), role: "visitor", text }]);
    setSending(true);
    try {
      const res = await fetch("/api/public/chat/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          host: hostOrigin,
          sessionToken,
          conversationId,
          text,
          meta: { currentPage: page, landingPage: page, referrer: params.get("r") },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setConversationId(data.conversationId);
      if (data.liveAgent) {
        setView("waiting");
        setSending(false);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "bot",
          text: data.answer,
          sources: data.sources,
          aiResponseId: data.aiResponseId,
          escalate: data.escalate,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "system", text: (e as Error).message || "We could not reach the assistant." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const rateAnswer = async (aiResponseId: string, helpful: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.aiResponseId === aiResponseId ? { ...m, aiResponseId: undefined } : m)),
    );
    await fetch("/api/public/chat/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiResponseId, helpful }),
    });
  };

  /* -------------------------------- UI --------------------------------- */

  if (error) {
    return (
      <div className="flex h-screen items-end justify-end p-2">
        <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
          {error}
        </div>
      </div>
    );
  }

  if (!config) return <div className="h-screen w-full bg-transparent" />;

  if (!open) {
    return (
      <div className="flex h-screen w-full flex-col items-end justify-end gap-3 p-2" style={{ fontFamily: config.website.fontFamily }}>
        {showTeaser && (
          <div
            className="relative w-full max-w-[300px] border border-border/60 bg-card/95 p-4 text-sm shadow-float backdrop-blur"
            style={{ borderRadius: radius }}
          >
            <button
              onClick={dismissTeaser}
              aria-label="Dismiss message"
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition hover:bg-muted"
            >
              ✕
            </button>
            <p className="pr-6 font-medium leading-snug text-card-foreground">{config.website.triggerMessage}</p>
            <button
              onClick={openWidget}
              className="mt-3 w-full rounded-full px-3 py-2 text-sm font-semibold text-white shadow-panel transition hover:brightness-110"
              style={{ background: brand }}
            >
              Start chat
            </button>
          </div>
        )}
        <button
          onClick={openWidget}
          aria-label="Open chat"
          className="group relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-float ring-1 ring-white/25 transition duration-200 hover:-translate-y-0.5 hover:scale-105 active:scale-95"
          style={{ background: `linear-gradient(145deg, ${brand}, color-mix(in oklab, ${brand} 72%, black))` }}
        >
          <span
            className="absolute inset-0 rounded-full opacity-0 transition group-hover:opacity-100"
            style={{ boxShadow: `0 0 0 6px color-mix(in oklab, ${brand} 22%, transparent)` }}
            aria-hidden="true"
          />
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex h-screen w-full flex-col overflow-hidden bg-card shadow-float ring-1 ring-black/5"
      style={{ borderRadius: radius, fontFamily: config.website.fontFamily }}
    >
      <header
        className="relative flex items-center gap-3 px-4 py-3.5 text-white"
        style={{ background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 68%, black))` }}
      >
        <span
          className="pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full bg-white/10 blur-2xl"
          aria-hidden="true"
        />
        <div className="relative shrink-0">
          {config.website.logoUrl ? (
            <img src={config.website.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-2 ring-white/30" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-bold ring-2 ring-white/25">
              {config.organization.name.slice(0, 1)}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white/80 ${
              config.agentsAvailable ? "bg-emerald-400" : "bg-amber-300"
            }`}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">{config.website.chatbotName}</p>
          <p className="truncate text-[11px] text-white/80">
            {config.agentsAvailable ? "Live representatives are available" : "AI assistant · leave a message anytime"}
          </p>
        </div>
        {view !== "menu" && (
          <button
            onClick={() => setView("menu")}
            className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium transition hover:bg-white/20"
            aria-label="Back to menu"
          >
            Menu
          </button>
        )}
        <button
          onClick={closeWidget}
          aria-label="Close chat"
          className="grid h-8 w-8 place-items-center rounded-full text-base leading-none transition hover:bg-white/15"
        >
          ✕
        </button>
      </header>


      <div ref={scroller} className="flex-1 overflow-y-auto bg-background px-4 py-4">
        {view === "menu" && (
          <MenuView
            config={config}
            brand={brand}
            onSelect={(key) => {
              if (key === "services") setView("services");
              else if (key === "faq") setView("faq");
              else if (key === "contact") setView("contact");
              else if (key === "referral") {
                setFormKind("referral");
                setView("form");
              } else if (key === "enrollment") {
                setFormKind("enrollment");
                setView("form");
              } else setView("chat");
            }}
            onLiveAgent={() => {
              setFormKind(config.agentsAvailable ? "live_agent" : "message");
              setView("form");
            }}
          />
        )}

        {view === "services" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Our services</h2>
            {config.services.map((s) => (
              <div key={s.id} className="rounded-xl border border-border bg-card p-3">
                <p className="text-sm font-semibold text-card-foreground">{s.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.short_description}</p>
                {s.eligibility_overview && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Eligibility: </span>
                    {s.eligibility_overview}
                  </p>
                )}
                {s.counties?.length > 0 && (
                  <p className="mt-1 text-[11px] text-muted-foreground">Counties: {s.counties.join(", ")}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white"
                    style={{ background: brand }}
                    onClick={() => sendQuestion(`Tell me more about ${s.name}`)}
                  >
                    Ask a question
                  </button>
                  <button
                    className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-foreground"
                    onClick={() => {
                      setFormKind("enrollment");
                      setView("form");
                    }}
                  >
                    Request assistance
                  </button>
                  {s.learn_more_url && (
                    <a
                      href={s.learn_more_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-foreground"
                    >
                      Learn more
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "faq" && (
          <div className="space-y-3">
            <input
              value={faqQuery}
              onChange={(e) => setFaqQuery(e.target.value)}
              placeholder="Search questions"
              aria-label="Search frequently asked questions"
              className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
            />
            {config.faqs
              .filter(
                (f) =>
                  !faqQuery ||
                  f.question.toLowerCase().includes(faqQuery.toLowerCase()) ||
                  f.answer.toLowerCase().includes(faqQuery.toLowerCase()),
              )
              .map((f) => (
                <details key={f.id} className="rounded-xl border border-border bg-card p-3">
                  <summary className="cursor-pointer text-sm font-medium text-card-foreground">{f.question}</summary>
                  <p className="mt-2 text-xs text-muted-foreground">{f.answer}</p>
                  <span className="mt-2 block text-[10px] uppercase tracking-wide text-muted-foreground">{f.category}</span>
                </details>
              ))}
          </div>
        )}

        {view === "contact" && (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="font-semibold text-card-foreground">{config.organization.name}</p>
              <p className="mt-2 text-xs text-muted-foreground">Phone: {config.organization.phone}</p>
              <p className="text-xs text-muted-foreground">Email: {config.organization.email}</p>
              <p className="text-xs text-muted-foreground">{config.organization.address}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {config.businessOpen
                  ? "Live representatives are available."
                  : config.website.offlineMessage}
              </p>
            </div>
            <button
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white"
              style={{ background: brand }}
              onClick={() => {
                setFormKind("contact");
                setView("form");
              }}
            >
              Send us a message
            </button>
          </div>
        )}

        {view === "form" && (
          <IntakeForm
            kind={formKind}
            config={config}
            brand={brand}
            onCancel={() => setView("menu")}
            onSubmit={async (payload) => {
              const res = await fetch("/api/public/chat/escalate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  websiteId,
                  host: hostOrigin,
                  sessionToken,
                  conversationId,
                  kind: formKind,
                  ...payload,
                }),
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Submission failed");
              setConversationId(data.conversationId);
              setLiveStatus(
                formKind === "live_agent"
                  ? data.agentsAvailable
                    ? "Looking for an available representative"
                    : "No representative is currently available — your message has been saved."
                  : "Your request has been received. A representative will follow up.",
              );
              setView("waiting");
            }}
          />
        )}

        {view === "waiting" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4 text-center">
              <p className="text-sm font-semibold text-card-foreground">{liveStatus ?? "Connecting you"}</p>
              {agentName && <p className="mt-1 text-xs text-muted-foreground">You are chatting with {agentName}.</p>}
              {!agentName && (
                <p className="mt-1 text-xs text-muted-foreground">
                  You can keep typing below — a representative will see everything you send.
                </p>
              )}
            </div>
            {messages
              .filter((m) => m.role !== "system")
              .map((m) => (
                <MessageBubble key={m.id} bubble={m} brand={brand} onRate={rateAnswer} onAction={() => {}} />
              ))}
          </div>
        )}

        {view === "chat" && (
          <div className="space-y-3">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                bubble={m}
                brand={brand}
                onRate={rateAnswer}
                onAction={(action) => {
                  if (action === "connect") {
                    setFormKind(config.agentsAvailable ? "live_agent" : "message");
                    setView("form");
                  }
                  if (action === "message") {
                    setFormKind("message");
                    setView("form");
                  }
                }}
              />
            ))}
            {sending && (
              <div className="flex w-fit items-center gap-1.5 rounded-2xl bg-muted px-3 py-2.5">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70" />
              </div>

            )}
          </div>
        )}
      </div>

      {(view === "chat" || view === "menu" || view === "waiting") && (
        <form
          className="border-t border-border/70 bg-card px-3 pb-3 pt-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuestion(input);
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-1.5 transition focus-within:border-transparent focus-within:ring-2 focus-within:ring-ring/40">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuestion(input);
                }
              }}
              rows={1}
              placeholder="Type your question…"
              aria-label="Type your question"
              className="max-h-24 min-h-[36px] flex-1 resize-none border-0 bg-transparent px-2.5 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white shadow-sm transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
              style={{ background: brand }}
              aria-label="Send message"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <p className="mt-2 px-1 text-[10px] leading-tight text-muted-foreground">{config.organization.privacyNotice}</p>

        </form>
      )}
    </div>
  );
}

function MenuView({
  config,
  brand,
  onSelect,
  onLiveAgent,
}: {
  config: Config;
  brand: string;
  onSelect: (key: string) => void;
  onLiveAgent: () => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-foreground">{config.website.welcomeMessage}</p>
      <div className="grid gap-2">
        {config.website.menuButtons.map((b) => (
          <button
            key={b.key}
            onClick={() => onSelect(b.key)}
            className="group flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left text-sm font-medium text-card-foreground shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-transparent hover:shadow-panel"
          >
            <span
              className="h-8 w-1 shrink-0 rounded-full transition-all duration-200 group-hover:h-9"
              style={{ background: brand }}
              aria-hidden="true"
            />
            <span className="flex-1">{b.label}</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        ))}
      </div>
      <button
        onClick={onLiveAgent}
        className="w-full rounded-2xl px-4 py-3.5 text-sm font-semibold text-white shadow-panel transition duration-200 hover:-translate-y-0.5 hover:brightness-110"
        style={{ background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 70%, black))` }}
      >
        Speak with a Live Representative
      </button>
      <p className="text-[11px] leading-tight text-muted-foreground">{config.website.privacyDisclaimer}</p>
    </div>
  );

}

function MessageBubble({
  bubble,
  brand,
  onRate,
  onAction,
}: {
  bubble: Bubble;
  brand: string;
  onRate: (id: string, helpful: boolean) => void;
  onAction: (action: "connect" | "message") => void;
}) {
  if (bubble.role === "visitor") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl px-3 py-2 text-sm text-white" style={{ background: brand }}>
          {bubble.text}
        </div>
      </div>
    );
  }
  if (bubble.role === "system") {
    return <p className="text-center text-xs text-destructive">{bubble.text}</p>;
  }
  return (
    <div className="space-y-2">
      {bubble.author && <p className="text-[10px] font-semibold uppercase text-muted-foreground">{bubble.author}</p>}
      <p className="whitespace-pre-wrap text-sm text-foreground">{bubble.text}</p>
      {bubble.sources && bubble.sources.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Based on:{" "}
          {bubble.sources.map((s, i) => (
            <span key={s.articleId}>
              {i > 0 && ", "}
              {s.url ? (
                <a className="underline" href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </span>
          ))}
        </div>
      )}
      {bubble.escalate && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onAction("connect")}
            className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white"
            style={{ background: brand }}
          >
            Connect me
          </button>
          <button
            onClick={() => onAction("message")}
            className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold"
          >
            Leave a message
          </button>
        </div>
      )}
      {bubble.aiResponseId && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          Was this helpful?
          <button className="underline" onClick={() => onRate(bubble.aiResponseId!, true)}>
            Yes
          </button>
          <button className="underline" onClick={() => onRate(bubble.aiResponseId!, false)}>
            No
          </button>
        </div>
      )}
    </div>
  );
}

function IntakeForm({
  kind,
  config,
  brand,
  onSubmit,
  onCancel,
}: {
  kind: string;
  config: Config;
  brand: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState({
    fullName: "",
    phone: "",
    email: "",
    reason: "",
    county: "",
    healthPlan: "",
    serviceInterest: "",
    preferredLanguage: "English",
    consent: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const titles: Record<string, string> = {
    live_agent: "Speak with a representative",
    message: "Leave a message",
    contact: "Contact us",
    referral: "Submit a referral",
    enrollment: "Enrollment assistance",
  };

  const set = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr(null);
        if (!values.consent) {
          setErr("Please provide consent before submitting.");
          return;
        }
        setBusy(true);
        try {
          await onSubmit(values);
        } catch (error) {
          setErr((error as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="text-sm font-semibold text-foreground">{titles[kind] ?? "Request assistance"}</h2>
      {(kind === "referral" || kind === "enrollment") && (
        <p className="rounded-lg bg-muted p-2 text-[11px] text-muted-foreground">
          {config.organization.privacyNotice}
        </p>
      )}
      <Field label="Full name" required value={values.fullName} onChange={(v) => set("fullName", v)} />
      <Field label="Phone number" required type="tel" value={values.phone} onChange={(v) => set("phone", v)} />
      <Field label="Email address" required type="email" value={values.email} onChange={(v) => set("email", v)} />
      {(kind === "referral" || kind === "enrollment") && (
        <>
          <Field label="County" value={values.county} onChange={(v) => set("county", v)} />
          <Field label="Health plan" value={values.healthPlan} onChange={(v) => set("healthPlan", v)} />
          <Field label="Service of interest" value={values.serviceInterest} onChange={(v) => set("serviceInterest", v)} />
          <Field label="Preferred language" value={values.preferredLanguage} onChange={(v) => set("preferredLanguage", v)} />
        </>
      )}
      <label className="block text-xs font-medium text-foreground">
        Reason for contacting
        <textarea
          value={values.reason}
          onChange={(e) => set("reason", e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal"
        />
      </label>
      <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={values.consent}
          onChange={(e) => set("consent", e.target.checked)}
          className="mt-0.5"
          required
        />
        <span>{config.website.consentLanguage}</span>
      </label>
      {err && <p className="text-xs text-destructive">{err}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: brand }}
        >
          {busy ? "Submitting…" : "Submit"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-border px-3 py-2 text-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-medium text-foreground">
      {label}
      {required && <span aria-hidden="true"> *</span>}
      <input
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal"
      />
    </label>
  );
}
