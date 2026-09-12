import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import brandLogoAsset from "@/assets/phg-logo-light.png.asset.json";
import {
  CheckCircle,
  ClipboardCheck,
  Clock,
  Headset,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  UserPlus,
} from "lucide-react";
import { resolveWidgetTabs, tabIconPath } from "@/lib/widget-tabs";
import {
  isConversationEnded,
  nextPollDelay,
  POLL_MIN_MS,
  safeStorage,
  shouldShowRating,
} from "@/lib/widget-client";

const BRAND_LOGO_URL = brandLogoAsset.url;

export const Route = createFileRoute("/widget")({
  head: () => ({
    meta: [
      { title: "Chat widget" },
      { name: "robots", content: "noindex" },
      { name: "description", content: "Embedded website chat widget." },
    ],
    styles: [
      {
        children: "html,body,#root{background:transparent !important;margin:0;overflow:hidden;}",
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
    homeGreeting?: string;
    homeHeadline?: string;
    homeSubtitle?: string;
    homeCtaTitle?: string;
    homeCtaSubtitle?: string;
    helpTitle?: string;
    privacyFooterText?: string;
    showHomeTab?: boolean;
    showHelpTab?: boolean;
    showServicesTab?: boolean;
    showRequestsTab?: boolean;
    tabs?: unknown;
  };
  organization: {
    name: string;
    logoUrl?: string | null;
    mapsUrl?: string | null;
    phone: string;
    email: string;
    address: string;
    privacyNotice: string;
    emergencyMessage: string;
  };
  departments: Array<{ id: string; name: string; description: string | null }>;
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
  team?: Array<{ id: string; name: string; avatarUrl: string }>;
  businessOpen: boolean;
  /** "Monday, September 14 at 9:00 AM" in the org's timezone, or null. */
  nextOpenAt?: string | null;
  agentsAvailable: boolean;
};

/**
 * The organization's contact details, rendered the same way everywhere the
 * widget shows them so there is only one card to maintain.
 */
function ContactCard({ config, brand }: { config: Config; brand: string }) {
  const org = config.organization;
  const phoneDigits = (org.phone || "").replace(/[^\d+]/g, "");
  const mapsHref = org.address
    ? org.mapsUrl || `https://maps.google.com/?q=${encodeURIComponent(org.address)}`
    : null;

  const rows = [
    org.phone && {
      key: "phone",
      Icon: Phone,
      label: "Phone",
      node: (
        <a
          href={`tel:${phoneDigits}`}
          aria-label={`Call ${org.phone}`}
          className="font-medium hover:underline"
          style={{ color: brand }}
        >
          {org.phone}
        </a>
      ),
    },
    org.email && {
      key: "email",
      Icon: Mail,
      label: "Email",
      node: (
        <a
          href={`mailto:${org.email}`}
          aria-label={`Email ${org.email}`}
          className="font-medium break-all hover:underline"
          style={{ color: brand }}
        >
          {org.email}
        </a>
      ),
    },
    org.address && {
      key: "address",
      Icon: MapPin,
      label: "Address",
      node: mapsHref ? (
        <a
          href={mapsHref}
          target="_blank"
          rel="noreferrer"
          className="font-medium hover:underline"
          style={{ color: brand }}
        >
          {org.address}
        </a>
      ) : (
        <span className="text-card-foreground">{org.address}</span>
      ),
    },
  ].filter(Boolean) as Array<{
    key: string;
    Icon: typeof Phone;
    label: string;
    node: React.ReactNode;
  }>;

  const [logoFailed, setLogoFailed] = useState(false);
  const NoticeIcon = config.businessOpen ? CheckCircle : Clock;
  const notice = config.businessOpen
    ? "Live representatives are available now."
    : config.website.offlineMessage;

  return (
    <div
      className="rounded-xl border border-border bg-card p-4"
      style={{ fontFamily: config.website.fontFamily, lineHeight: 1.5 }}
    >
      {org.logoUrl && !logoFailed ? (
        <img
          src={org.logoUrl}
          alt={org.name}
          onError={() => setLogoFailed(true)}
          className="mb-3 w-auto object-contain object-left"
          style={{ maxHeight: 36 }}
        />
      ) : (
        <p className="mb-3 font-semibold text-card-foreground">{org.name}</p>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              // 10% tint of the site's own primary colour.
              style={{ background: `${brand}1a` }}
            >
              <row.Icon size={16} style={{ color: brand }} />
            </span>
            <span className="min-w-0">
              <span
                className="block font-semibold text-card-foreground"
                style={{ fontSize: 13, lineHeight: 1.5 }}
              >
                {row.label}
              </span>
              <span className="block" style={{ fontSize: 15, lineHeight: 1.5 }}>
                {row.node}
              </span>
            </span>
          </div>
        ))}
      </div>

      {notice ? (
        <div
          className="mt-4 flex items-start gap-2 rounded-lg p-3 text-muted-foreground"
          style={{ background: `${brand}0f`, fontSize: 13, lineHeight: 1.5 }}
        >
          <NoticeIcon size={15} style={{ color: brand }} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * One sentence, used identically on the home card, in the request form and on
 * the confirmation screen, so an after-hours visitor is told the same thing
 * everywhere.
 */
function afterHoursNotice(config: Config): string {
  const when = config.nextOpenAt ? `on ${config.nextOpenAt}` : "on our next business day";
  return `We're currently outside our operating hours. Leave your details and one of our member engagement specialists will contact you ${when}.`;
}

type Bubble = {
  id: string;
  role: "visitor" | "bot" | "system";
  text: string;
  sources?: Array<{
    articleId?: string | null;
    sourceType?: string;
    sourceId?: string;
    title: string;
    url: string | null;
  }>;
  aiResponseId?: string;
  escalate?: boolean;
  suggestHuman?: boolean;
  author?: string;
  attachment?: { name: string; url: string | null; type: string };
};

type View =
  | "menu"
  | "chat"
  | "services"
  | "service"
  | "faq"
  | "contact"
  | "form"
  | "waiting"
  | "requests";

type Tab = "home" | "chat" | "help" | "services" | "requests";

const TABS: { key: Tab; label: string; view: View; icon: string }[] = [
  {
    key: "home",
    label: "Home",
    view: "menu",
    icon: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  },
  {
    key: "chat",
    label: "Chat",
    view: "chat",
    icon: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z",
  },
  {
    key: "help",
    label: "Help",
    view: "faq",
    icon: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17h0",
  },
  { key: "services", label: "Services", view: "services", icon: "M4 6h16M4 12h16M4 18h10" },
  {
    key: "requests",
    label: "Requests",
    view: "requests",
    icon: "M9 4h6a2 2 0 0 1 2 2v14l-5-3-5 3V6a2 2 0 0 1 2-2z",
  },
];

function tabForView(view: View): Tab {
  if (view === "chat" || view === "waiting") return "chat";
  if (view === "faq") return "help";
  if (view === "services" || view === "service") return "services";
  if (view === "requests" || view === "form" || view === "contact") return "requests";
  return "home";
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function post(type: string, payload: Record<string, unknown> = {}) {
  if (typeof window === "undefined" || window.parent === window) return;
  window.parent.postMessage({ source: "lovable-chat-widget", type, ...payload }, "*");
}

function WidgetPage() {
  const [params] = useState(() =>
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search),
  );
  const websiteId = params.get("w") ?? "";
  const hostOrigin = params.get("h");
  const originProof = params.get("op");
  const page = params.get("p") ?? "";
  /** Admin console preview: accepts live config edits from the parent frame. */
  const isPreview = params.get("preview") === "1";

  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showTeaser, setShowTeaser] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [messages, setMessages] = useState<Bubble[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [formKind, setFormKind] = useState<
    "live_agent" | "contact" | "referral" | "enrollment" | "message"
  >("live_agent");
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [agentAvatar, setAgentAvatar] = useState<string | null>(null);
  const [faqQuery, setFaqQuery] = useState("");
  /** Service shown in the detail view, and prefilled into intake forms. */
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [serviceInterest, setServiceInterest] = useState("");
  /** Latest conversation status reported by the server. */
  const [convStatus, setConvStatus] = useState<string | null>(null);
  /** True once a human (not the assistant) has replied in this conversation. */
  const [agentReplied, setAgentReplied] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  /** Newest message timestamp we have rendered, per conversation id. */
  const lastSeenByConversation = useRef<Record<string, string>>({});
  /** Set while a send is in flight so two fast Enters cannot open two chats. */
  const inFlight = useRef(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const storageKey = `phg-widget-${websiteId}`;
  const threadKey = `${storageKey}-conv-v1`;
  const ended = isConversationEnded(convStatus);

  // Personalized greeting when the visitor has already told us their name.
  const [visitorName, setVisitorName] = useState<string | null>(null);
  useEffect(() => {
    const stored = safeStorage.get(`phg-widget-${websiteId}-name`);
    if (stored) setVisitorName(stored.split(" ")[0] ?? null);
  }, [websiteId]);

  /* ------------------- restore / persist the conversation ---------------- */
  // The widget lives in an iframe that is torn down on every page navigation,
  // so the thread has to be rebuilt from storage or the visitor loses it.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (!websiteId) return;
    const saved = safeStorage.getJson<{
      conversationId: string;
      messages: Bubble[];
      live?: boolean;
      agentName?: string | null;
      agentAvatar?: string | null;
    }>(threadKey);
    if (saved?.conversationId && Array.isArray(saved.messages)) {
      setConversationId(saved.conversationId);
      setMessages(saved.messages);
      // A live conversation must keep polling after the iframe is rebuilt,
      // otherwise the representative's replies never arrive.
      if (saved.live) {
        setAgentName(saved.agentName ?? null);
        setAgentAvatar(saved.agentAvatar ?? null);
        if (saved.agentName) setAgentReplied(true);
        setLiveStatus(saved.agentName ? "Representative connected" : "Connecting you");
        setView("waiting");
      }
    }
    setRestored(true);
  }, [websiteId, threadKey]);

  useEffect(() => {
    if (!restored) return;
    if (!conversationId || ended) return;
    safeStorage.setJson(threadKey, {
      conversationId,
      messages: messages.filter((m) => m.role !== "system").slice(-60),
      live: Boolean(liveStatus) || view === "waiting" || agentReplied,
      agentName,
      agentAvatar,
      updatedAt: Date.now(),
    });
  }, [
    restored,
    conversationId,
    messages,
    ended,
    threadKey,
    liveStatus,
    view,
    agentReplied,
    agentName,
    agentAvatar,
  ]);

  /* Rating dismissal is remembered per conversation, not per page view. */
  const ratingKey = conversationId ? `${storageKey}-rated-${conversationId}` : null;
  const [ratingDismissed, setRatingDismissed] = useState(false);
  useEffect(() => {
    setRatingDismissed(ratingKey ? safeStorage.get(ratingKey) === "1" : false);
  }, [ratingKey]);
  const dismissRating = useCallback(() => {
    if (ratingKey) safeStorage.set(ratingKey, "1");
    setRatingDismissed(true);
  }, [ratingKey]);

  /** Forget the finished chat and start over from the welcome message. */
  const startNewChat = useCallback(() => {
    safeStorage.remove(threadKey);
    setConversationId(null);
    setConvStatus(null);
    setAgentReplied(false);
    setAgentName(null);
    setAgentAvatar(null);
    setLiveStatus(null);
    setMessages(config ? [{ id: uid(), role: "bot", text: config.website.welcomeMessage }] : []);
    setView("chat");
  }, [threadKey, config]);

  // Suggested help topics on Home: services first, then FAQ questions.
  const homeTopics = useMemo(() => {
    if (!config) return [];
    const services = (config.services ?? []).slice(0, 2).map((s) => ({
      id: `svc-${s.id}`,
      label: s.name,
      kind: "service" as const,
    }));
    const faqs = (config.faqs ?? []).slice(0, 4 - services.length).map((f) => ({
      id: `faq-${f.id}`,
      label: f.question,
      kind: "faq" as const,
    }));
    return [...services, ...faqs];
  }, [config]);

  const activeService = useMemo(
    () => (config?.services ?? []).find((s) => s.id === activeServiceId) ?? null,
    [config, activeServiceId],
  );

  /** Open the service detail card. Never calls the assistant. */
  const openService = useCallback((id: string) => {
    setActiveServiceId(id);
    setView("service");
  }, []);

  /* ------------------------- signed chat session ------------------------ */
  // The server mints and signs the session; the browser only stores it.
  const sessionRef = useRef<{ token: string; expiresAt: string } | null>(null);

  const ensureSession = useCallback(
    async (force = false): Promise<string> => {
      const key = `${storageKey}-session-v2`;
      const cached =
        sessionRef.current ?? safeStorage.getJson<{ token: string; expiresAt: string }>(key);
      if (!force && cached?.token && Date.parse(cached.expiresAt) - 60_000 > Date.now()) {
        sessionRef.current = cached;
        return cached.token;
      }
      const res = await fetch("/api/public/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          websiteId,
          host: hostOrigin,
          originProof,
          // Hand back the token being replaced: the server reuses the same
          // visitor when it is genuine, so older conversations stay reachable.
          priorSession: cached?.token ?? null,
          meta: {
            currentPage: page,
            landingPage: page,
            referrer: params.get("r"),
            deviceType:
              typeof window !== "undefined" && window.innerWidth < 640 ? "mobile" : "desktop",
            // So the assistant can answer in the visitor's own language.
            language: typeof navigator !== "undefined" ? navigator.language : null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Unable to start a chat session");
      sessionRef.current = { token: json.token, expiresAt: json.expiresAt };
      safeStorage.setJson(key, sessionRef.current);
      return json.token as string;
    },
    [storageKey, websiteId, hostOrigin, originProof, page, params],
  );

  /** POST to a public chat endpoint, transparently re-minting an expired session. */
  const chatPost = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      const send = async (token: string) =>
        fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, session: token, host: hostOrigin }),
        });
      let res = await send(await ensureSession());
      if (res.status === 401) res = await send(await ensureSession(true));
      return res;
    },
    [ensureSession, hostOrigin],
  );

  /* ---------------------------- load config ---------------------------- */
  useEffect(() => {
    if (!websiteId) {
      setError("Missing website id");
      return;
    }
    fetch(
      `/api/public/chat/config?w=${encodeURIComponent(websiteId)}&h=${encodeURIComponent(hostOrigin ?? "")}&op=${encodeURIComponent(originProof ?? "")}`,
    )
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          // Visitors see something actionable; the technical reason is for us.
          if (json.code) console.warn("[chat widget]", json.code);
          throw new Error(json.error ?? "This chat isn't available on this page yet.");
        }
        setConfig(json as Config);
      })
      .catch((e: Error) => setError(e.message));
  }, [websiteId, hostOrigin, originProof]);

  /* ------- live config edits from the admin console (preview only) ------- */
  useEffect(() => {
    if (!isPreview || typeof window === "undefined") return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; config?: Record<string, unknown> } | null;
      if (!data || data.type !== "cc-preview-config" || !data.config) return;
      setConfig((prev) =>
        prev ? { ...prev, website: { ...prev.website, ...data.config } } : prev,
      );
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isPreview]);

  /* ------------------- teaser / auto-open / hidden pages ---------------- */
  useEffect(() => {
    if (!config) return;
    post("position", { value: config.website.position });

    const hidden = (config.website.hiddenPaths ?? []).some((p) => p && page.startsWith(p));
    if (hidden) {
      post("hide");
      return;
    }

    const dismissedAt = Number(safeStorage.get(`${storageKey}-dismissed`) ?? 0);
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
  // Each conversation keeps its own "newest message seen" marker, so opening
  // the waiting view never re-renders bubbles the visitor already read.
  useEffect(() => {
    if (!conversationId || view !== "waiting" || ended) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = POLL_MIN_MS;
    let lastMessageAt = Date.now();

    const tick = async () => {
      const request = async (token: string) => {
        const qs = new URLSearchParams({ c: conversationId, s: token, h: hostOrigin ?? "" });
        const since = lastSeenByConversation.current[conversationId];
        if (since) qs.set("since", since);
        return fetch(`/api/public/chat/poll?${qs.toString()}`);
      };
      try {
        let res = await request(await ensureSession());
        if (res.status === 401) res = await request(await ensureSession(true));
        if (cancelled) return;
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        if (data.status) setConvStatus(data.status as string);
        if (data.connected && data.agentName) {
          setAgentName(data.agentName);
          setAgentAvatar(data.agentAvatarUrl ?? null);
          setLiveStatus("Representative connected");
        }
        const incoming = (data.messages ?? []).filter(
          (m: any) => m.sender_type === "agent" || m.sender_type === "ai",
        );
        if (incoming.length) {
          lastMessageAt = Date.now();
          delay = POLL_MIN_MS;
          lastSeenByConversation.current[conversationId] = incoming[incoming.length - 1].created_at;
          if (incoming.some((m: any) => m.sender_type === "agent")) setAgentReplied(true);
          setMessages((prev) => {
            const known = new Set(prev.map((p) => p.id));
            const fresh = incoming
              .filter((m: any) => !known.has(m.id))
              .map((m: any) => ({
                id: m.id,
                role: "bot" as const,
                text: m.body,
                author: m.sender_name ?? "Representative",
              }));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        }
        // A finished conversation stops the loop and drops the saved thread.
        if (isConversationEnded(data.status)) {
          cancelled = true;
          safeStorage.remove(threadKey);
          return;
        }
      } catch {
        /* transient network error — try again on the next tick */
      } finally {
        if (!cancelled) {
          delay = nextPollDelay(delay, Date.now() - lastMessageAt);
          timer = setTimeout(tick, delay);
        }
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [conversationId, view, ended, ensureSession, hostOrigin, threadKey]);

  // A conversation that just ended should not keep a stale saved copy around.
  useEffect(() => {
    if (ended) safeStorage.remove(threadKey);
  }, [ended, threadKey]);

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
    safeStorage.set(`${storageKey}-dismissed`, String(Date.now()));
  };

  const closeWidget = () => {
    setOpen(false);
    safeStorage.set(`${storageKey}-dismissed`, String(Date.now()));
  };

  const sendQuestion = async (text: string) => {
    if (!text.trim() || !config) return;
    // One guard for both the Enter key and the send button: without it two
    // fast presses each started their own conversation.
    if (inFlight.current) return;
    inFlight.current = true;
    setView("chat");
    setInput("");
    setMessages((prev) => [...prev, { id: uid(), role: "visitor", text }]);
    setSending(true);
    try {
      const res = await chatPost("/api/public/chat/message", { conversationId, text });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setConversationId(data.conversationId);
      if (data.liveAgent) {
        setView("waiting");
        setSending(false);
        return;
      }
      // Store the server id and seed the poll cursor, so the same answer is
      // not rendered twice when the waiting view starts polling.
      if (data.conversationId && data.createdAt) {
        lastSeenByConversation.current[data.conversationId as string] = data.createdAt as string;
      }
      setMessages((prev) => {
        const bubble = {
          id: (data.messageId as string) ?? uid(),
          role: "bot" as const,
          text: data.answer,
          sources: data.sources,
          aiResponseId: data.aiResponseId,
          escalate: data.escalate,
          suggestHuman: Boolean(data.suggestHuman),
        };
        return prev.some((m) => m.id === bubble.id) ? prev : [...prev, bubble];
      });
      // A crisis pulls a person in straight away: switch to the waiting view so
      // the widget starts polling for the representative's reply.
      if (data.crisis) setView("waiting");
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "system",
          text: (e as Error).message || "We could not reach the assistant.",
        },
      ]);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  /** Upload a file to the current conversation so the representative can see it. */
  const sendAttachment = async (file: File) => {
    if (!file || !config) return;
    if (file.size > 10 * 1024 * 1024) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "system", text: "Files must be under 10 MB." },
      ]);
      return;
    }
    setUploading(true);
    if (view === "menu") setView("chat");
    try {
      const send = async (token: string) => {
        const form = new FormData();
        form.append("session", token);
        if (hostOrigin) form.append("host", hostOrigin);
        if (conversationId) form.append("conversationId", conversationId);
        form.append("file", file);
        return fetch("/api/public/chat/upload", { method: "POST", body: form });
      };
      let res = await send(await ensureSession());
      if (res.status === 401) res = await send(await ensureSession(true));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not upload that file");
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: "visitor",
          text: `Sent an attachment: ${data.attachment.name}`,
          attachment: data.attachment,
        },
      ]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "system", text: (e as Error).message || "Could not upload that file." },
      ]);
    } finally {
      setUploading(false);
    }
  };

  const rateAnswer = async (aiResponseId: string, helpful: boolean) => {
    setMessages((prev) =>
      prev.map((m) => (m.aiResponseId === aiResponseId ? { ...m, aiResponseId: undefined } : m)),
    );
    if (!conversationId) return;
    await chatPost("/api/public/chat/feedback", { conversationId, aiResponseId, helpful });
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
      <div
        className="flex h-screen w-full flex-col items-end justify-end gap-3 p-2"
        style={{ fontFamily: config.website.fontFamily }}
      >
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
            <p className="pr-6 font-medium leading-snug text-card-foreground">
              {config.website.triggerMessage}
            </p>
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
          style={{
            background: `linear-gradient(145deg, ${brand}, color-mix(in oklab, ${brand} 72%, black))`,
          }}
        >
          <span
            className="absolute inset-0 rounded-full opacity-0 transition group-hover:opacity-100"
            style={{ boxShadow: `0 0 0 6px color-mix(in oklab, ${brand} 22%, transparent)` }}
            aria-hidden="true"
          />
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
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
      {view !== "menu" && (
        <header
          className="relative flex items-center gap-3 px-4 py-3.5 text-white"
          style={{
            background: `linear-gradient(135deg, ${brand}, color-mix(in oklab, ${brand} 68%, black))`,
          }}
        >
          <span
            className="pointer-events-none absolute -right-10 -top-16 h-32 w-32 rounded-full bg-white/10 blur-2xl"
            aria-hidden="true"
          />
          <div className="relative shrink-0">
            {agentAvatar ? (
              <img
                src={agentAvatar}
                alt={agentName ?? "Representative"}
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white/30"
              />
            ) : (
              <div className="grid h-9 w-9 place-items-center rounded-full bg-white/15 ring-2 ring-white/25">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
                </svg>
              </div>
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white/80 ${
                agentName || config.agentsAvailable ? "bg-emerald-400" : "bg-amber-300"
              }`}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold tracking-tight">
              {agentName ?? "PHG CareConnect Assistant"}
            </p>
            <p className="truncate text-[11px] text-white/80">
              {agentName
                ? `${config.organization.name} · live representative`
                : config.agentsAvailable
                  ? "Live representatives are available"
                  : "AI assistant · leave a message anytime"}
            </p>
          </div>

          {!agentName && (
            // Outside business hours nobody can pick the chat up, so the offer
            // becomes a message instead of a promise of a live person.
            <button
              onClick={() => {
                // Always the live-agent request form; after hours it simply
                // carries the next-open notice.
                setFormKind("live_agent");
                setServiceInterest("");
                setView("form");
              }}
              className="relative shrink-0 whitespace-nowrap rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-semibold text-white ring-1 ring-white/25 transition hover:bg-white/25"
            >
              {config.businessOpen ? "Talk to an agent" : "Leave a message"}
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
      )}

      <div
        ref={scroller}
        className={`flex-1 overflow-y-auto bg-background ${view === "menu" ? "" : "px-4 py-4"}`}
      >
        {view === "menu" && (
          <HomeView
            config={config}
            brand={brand}
            logoUrl={config.website.logoUrl || BRAND_LOGO_URL}
            visitorName={visitorName}
            topics={homeTopics}
            onClose={closeWidget}
            onStartChat={() => {
              // The home call to action asks for a person, not the assistant.
              setFormKind("live_agent");
              setServiceInterest("");
              setView("form");
            }}
            onOpenHelp={() => setView("faq")}
            onTopic={(topic) => {
              if (topic.kind === "faq") {
                setFaqQuery(topic.label);
                setView("faq");
              } else {
                openService(topic.id.replace(/^svc-/, ""));
              }
            }}
          />
        )}

        {view === "services" && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Our services</h2>
            {config.services.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openService(s.id)}
                className="w-full rounded-xl border border-border bg-card p-3 text-left transition hover:border-foreground/20 hover:bg-muted/40"
              >
                <p className="text-sm font-semibold text-card-foreground">{s.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{s.short_description}</p>
                <span
                  className="mt-2 inline-block text-[11px] font-semibold"
                  style={{ color: brand }}
                >
                  View details →
                </span>
              </button>
            ))}
          </div>
        )}

        {view === "service" && activeService && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setView("services")}
              className="text-[11px] font-semibold text-muted-foreground hover:text-foreground"
            >
              ← All services
            </button>
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-card-foreground">{activeService.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {activeService.short_description}
              </p>
              {activeService.eligibility_overview && (
                <p className="mt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Eligibility: </span>
                  {activeService.eligibility_overview}
                </p>
              )}
              {activeService.counties?.length > 0 && (
                <p className="mt-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Counties: </span>
                  {activeService.counties.join(", ")}
                </p>
              )}
              {activeService.health_plans?.length > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">Health plans: </span>
                  {activeService.health_plans.join(", ")}
                </p>
              )}
              {activeService.learn_more_url && (
                <a
                  href={activeService.learn_more_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block text-[11px] font-semibold underline"
                  style={{ color: brand }}
                >
                  Learn more
                </a>
              )}
              <div className="mt-4 flex flex-col gap-2">
                <button
                  type="button"
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: brand }}
                  onClick={() => void sendQuestion(`Tell me more about ${activeService.name}`)}
                >
                  Ask a question about this
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground"
                  onClick={() => {
                    setServiceInterest(activeService.name);
                    setFormKind("enrollment");
                    setView("form");
                  }}
                >
                  Request assistance
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground"
                  onClick={() => {
                    setServiceInterest(activeService.name);
                    setFormKind("live_agent");
                    setView("form");
                  }}
                >
                  Talk to a representative
                </button>
              </div>
            </div>
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
                <details
                  key={f.id}
                  open={faqQuery.trim().toLowerCase() === f.question.trim().toLowerCase()}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <summary className="cursor-pointer text-sm font-medium text-card-foreground">
                    {f.question}
                  </summary>
                  <p className="mt-2 text-xs text-muted-foreground">{f.answer}</p>
                  <span className="mt-2 block text-[10px] uppercase tracking-wide text-muted-foreground">
                    {f.category}
                  </span>
                </details>
              ))}
          </div>
        )}

        {view === "requests" && (
          <div className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">How can we help?</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose a request and a representative will follow up.
              </p>
            </div>
            {[
              {
                key: "live_agent",
                title: "Speak with a representative",
                Icon: Headset,
                sub: config.agentsAvailable
                  ? "Someone is available now"
                  : "We will reply as soon as we are back",
              },
              {
                key: "referral",
                title: "Submit a referral",
                Icon: UserPlus,
                sub: "Refer a patient or member",
              },
              {
                key: "enrollment",
                title: "Enrollment assistance",
                Icon: ClipboardCheck,
                sub: "Get help choosing or joining a plan",
              },
              {
                key: "message",
                title: "Leave a message",
                Icon: MessageSquare,
                sub: "We will get back to you",
              },
            ].map((option) => (
              <button
                key={option.key}
                onClick={() => {
                  setFormKind(
                    option.key === "live_agent" && !config.agentsAvailable
                      ? "message"
                      : (option.key as typeof formKind),
                  );
                  setServiceInterest("");
                  setView("form");
                }}
                className="flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                  style={{ background: `color-mix(in oklab, ${brand} 10%, transparent)` }}
                  aria-hidden="true"
                >
                  <option.Icon size={18} style={{ color: brand }} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-card-foreground">
                    {option.title}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {option.sub}
                  </span>
                </span>
              </button>
            ))}
            <button
              onClick={() => setView("contact")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-border px-4 py-2.5 text-xs font-semibold text-foreground"
            >
              <Phone size={15} style={{ color: brand }} aria-hidden="true" />
              View contact details
            </button>
          </div>
        )}

        {view === "contact" && (
          <div className="space-y-3 text-sm">
            <ContactCard config={config} brand={brand} />
            <button
              className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white"
              style={{ background: brand }}
              onClick={() => {
                setFormKind("live_agent");
                setServiceInterest("");
                setView("form");
              }}
            >
              Speak to a live agent
            </button>
          </div>
        )}

        {view === "form" && (
          <IntakeForm
            key={`${formKind}-${serviceInterest}`}
            kind={formKind}
            initialServiceInterest={serviceInterest}
            config={config}
            brand={brand}
            onCancel={() => setView("menu")}
            onSubmit={async (payload) => {
              const res = await chatPost("/api/public/chat/escalate", {
                conversationId,
                kind: formKind,
                after_hours: !config.businessOpen,
                ...payload,
                departmentId: (payload.departmentId as string) || null,
              });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error ?? "Submission failed");
              setConversationId(data.conversationId);
              // Remember who this visitor is so a return visit greets them by
              // name (the greeting already reads this key).
              const givenName = String(payload["fullName"] ?? "").trim();
              if (givenName) {
                safeStorage.set(`${storageKey}-name`, givenName);
                setVisitorName(givenName.split(" ")[0] ?? null);
              }

              // Only a live-agent request means someone is waiting for a
              // person; the other forms just need a confirmation in the chat.
              if (formKind !== "live_agent") {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: uid(),
                    role: "bot",
                    text: "Thank you — we have received your details and a representative will follow up.",
                  },
                ]);
                setView("chat");
                return;
              }

              setLiveStatus(
                data.assignedAgent
                  ? `${data.assignedAgent} has been assigned and will join shortly`
                  : data.agentsAvailable
                    ? "Looking for an available representative"
                    : "No representative is currently available — your message has been saved.",
              );
              setView("waiting");
            }}
          />
        )}

        {view === "waiting" && (
          <div className="space-y-3">
            {ended ? (
              <EndedNotice brand={brand} onRestart={startNewChat} />
            ) : (
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-sm font-semibold text-card-foreground">
                  {liveStatus ?? "Connecting you"}
                </p>
                {agentName && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    You are chatting with {agentName}.
                  </p>
                )}
                {!agentName && config.businessOpen && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    You can keep typing below — a representative will see everything you send.
                  </p>
                )}
                {!agentName && !config.businessOpen && (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">{afterHoursNotice(config)}</p>
                    <button
                      type="button"
                      onClick={() => setView("chat")}
                      className="mt-3 rounded-lg px-3 py-2 text-xs font-semibold text-white"
                      style={{ background: brand }}
                    >
                      Continue with the assistant
                    </button>
                  </>
                )}
              </div>
            )}
            {messages
              .filter((m) => m.role !== "system")
              .map((m) => (
                <MessageBubble
                  key={m.id}
                  bubble={m}
                  brand={brand}
                  onRate={rateAnswer}
                  onAction={() => {}}
                />
              ))}
            {/* Only ask for a rating once a person replied or the chat ended. */}
            {shouldShowRating({
              conversationId,
              status: convStatus,
              agentReplied,
              dismissed: ratingDismissed,
              sending,
            }) && (
              <SatisfactionPrompt
                conversationId={conversationId!}
                brand={brand}
                chatPost={chatPost}
                onDismiss={dismissRating}
              />
            )}
          </div>
        )}

        {view === "chat" && (
          <div className="space-y-3">
            {!config.businessOpen && config.website.offlineMessage && (
              // The assistant still answers when the office is closed; this
              // only sets expectations about reaching a person.
              <p className="rounded-xl border border-border bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
                {config.website.offlineMessage}
              </p>
            )}
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                bubble={m}
                brand={brand}
                onRate={rateAnswer}
                onAction={(action) => {
                  if (action === "connect") {
                    setFormKind(config.agentsAvailable ? "live_agent" : "message");
                    setServiceInterest("");
                    setView("form");
                  }
                  if (action === "message") {
                    setFormKind("message");
                    setServiceInterest("");
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
            {ended && <EndedNotice brand={brand} onRestart={startNewChat} />}
            {shouldShowRating({
              conversationId,
              status: convStatus,
              agentReplied,
              dismissed: ratingDismissed,
              sending,
            }) && (
              <SatisfactionPrompt
                conversationId={conversationId!}
                brand={brand}
                chatPost={chatPost}
                onDismiss={dismissRating}
              />
            )}
          </div>
        )}
      </div>

      {(view === "chat" || view === "waiting") && !ended && (
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
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void sendAttachment(file);
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted disabled:opacity-40"
              aria-label="Attach a file"
              title="Attach a file"
            >
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
              >
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              type="submit"
              disabled={sending || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white shadow-sm transition hover:brightness-110 disabled:opacity-40 disabled:shadow-none"
              style={{ background: brand }}
              aria-label="Send message"
            >
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
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
          <p className="mt-2 line-clamp-2 px-1 text-[10px] leading-tight text-muted-foreground">
            {config.organization.privacyNotice}
          </p>
        </form>
      )}

      <nav
        aria-label="Chat sections"
        className="flex shrink-0 items-stretch gap-0.5 border-t border-border/60 bg-card px-1.5 pb-2 pt-1.5 [&>button]:flex-1"
      >
        {resolveWidgetTabs(config.website.tabs)
          .filter((t) => {
            const w = config.website;
            if (!t.enabled) return false;
            if (t.key === "home") return w.showHomeTab !== false;
            if (t.key === "help") return w.showHelpTab !== false;
            if (t.key === "services") return w.showServicesTab !== false;
            if (t.key === "requests") return w.showRequestsTab !== false;
            return true;
          })
          .map((t) => ({
            ...t,
            view: TABS.find((d) => d.key === t.key)!.view,
            icon: tabIconPath(t.icon),
          }))
          .map((tab) => {
            const active = tabForView(view) === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (tab.key === "chat" && conversationId && liveStatus) setView("waiting");
                  else setView(tab.view);
                }}
                className="flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition hover:bg-muted/60"
                style={active ? { color: brand } : undefined}
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 2.2 : 1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={active ? undefined : "text-muted-foreground"}
                >
                  <path d={tab.icon} />
                </svg>
                <span className={active ? undefined : "text-muted-foreground"}>{tab.label}</span>
              </button>
            );
          })}
      </nav>
    </div>
  );
}

/**
 * Home = discovery. A large branded hero, one primary "send us a message"
 * card and a help-discovery card. No menu list, no composer.
 */
function HomeView({
  config,
  brand,
  logoUrl,
  visitorName,
  topics,
  onClose,
  onStartChat,
  onOpenHelp,
  onTopic,
}: {
  config: Config;
  brand: string;
  logoUrl: string;
  visitorName: string | null;
  topics: Array<{ id: string; label: string; kind: "service" | "faq" }>;
  onClose: () => void;
  onStartChat: () => void;
  onOpenHelp: () => void;
  onTopic: (topic: { id: string; label: string; kind: "service" | "faq" }) => void;
}) {
  const team = (config.team ?? []).slice(0, 3);
  const [showPrivacy, setShowPrivacy] = useState(false);

  return (
    <div className="flex h-full flex-col">
      {/* ---------------------------- hero ---------------------------- */}
      <div
        className="relative shrink-0 overflow-hidden px-5 pb-10 pt-5 text-white"
        style={{
          background: `linear-gradient(150deg, color-mix(in oklab, ${brand} 82%, black) 0%, ${brand} 52%, color-mix(in oklab, ${brand} 62%, white) 100%)`,
        }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-white/15 blur-3xl"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-24 -left-10 h-48 w-48 rounded-full bg-white/10 blur-3xl"
        />

        <div className="relative flex items-start justify-between gap-3">
          <img
            src={logoUrl}
            alt={config.organization.name || "Pacific Health Group"}
            className="h-9 w-auto max-w-[170px] object-contain object-left drop-shadow-sm"
          />
          <div className="flex items-center gap-2">
            {team.length > 0 && (
              <div className="flex -space-x-2" aria-label="Our team">
                {team.map((m) => (
                  <img
                    key={m.id}
                    src={m.avatarUrl}
                    alt={m.name}
                    title={m.name}
                    className="h-7 w-7 rounded-full object-cover ring-2 ring-white/70"
                  />
                ))}
              </div>
            )}
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="grid h-8 w-8 place-items-center rounded-full text-base leading-none transition hover:bg-white/20"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="relative mt-7">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-white/95">
            {visitorName ? `Hi, ${visitorName}.` : config.website.homeGreeting || "Hi there."}
          </h1>
          <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-white">
            {config.website.homeHeadline || "How can we help?"}
          </h2>
          <p className="mt-2.5 text-[13px] text-white/85">
            {config.agentsAvailable
              ? "Our team is here to help."
              : config.website.homeSubtitle || "CareConnect AI is available anytime."}
          </p>
        </div>
      </div>

      {/* --------------------------- content --------------------------- */}
      <div className="-mt-6 flex-1 space-y-3 rounded-t-3xl bg-background px-4 pb-5 pt-4">
        {!config.businessOpen && config.website.offlineMessage && (
          <p className="rounded-2xl border border-border/60 bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
            {config.website.offlineMessage}
          </p>
        )}
        <button
          onClick={onStartChat}
          className="group flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-card p-4 text-left shadow-panel transition duration-200 hover:-translate-y-0.5"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
            style={{ background: brand }}
            aria-hidden="true"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold text-card-foreground">
              {config.website.homeCtaTitle || "Speak to a live agent"}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {!config.businessOpen
                ? afterHoursNotice(config)
                : config.agentsAvailable
                  ? "Typical reply time is a few minutes"
                  : config.website.homeCtaSubtitle ||
                    "Talk with a member engagement specialist"}
            </span>
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>

        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <button
            onClick={onOpenHelp}
            className="flex w-full items-center gap-2.5 text-left"
            aria-label="Search for help"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-muted-foreground"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.2-4.2" />
            </svg>
            <span className="text-[15px] font-semibold text-card-foreground">
              {config.website.helpTitle || "Search for help"}
            </span>
          </button>

          {topics.length > 0 && (
            <div className="mt-3 divide-y divide-border/60 border-t border-border/60">
              {topics.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onTopic(t)}
                  className="flex w-full items-center gap-2 py-2.5 text-left transition hover:opacity-80"
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] text-card-foreground">
                    {t.label}
                  </span>
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0 text-muted-foreground"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowPrivacy((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground hover:underline"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          {config.website.privacyFooterText || "Your privacy matters to us."}
        </button>
        {showPrivacy && (
          <p className="rounded-xl bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
            {config.organization.privacyNotice || config.website.privacyDisclaimer}
          </p>
        )}
      </div>
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
        <div
          className="max-w-[85%] rounded-2xl px-3 py-2 text-sm text-white"
          style={{ background: brand }}
        >
          {bubble.text}
          {bubble.attachment?.url && bubble.attachment.type.startsWith("image/") ? (
            <img
              src={bubble.attachment.url}
              alt={bubble.attachment.name}
              className="mt-2 max-h-40 rounded-lg"
            />
          ) : bubble.attachment?.url ? (
            <a
              className="mt-2 block underline"
              href={bubble.attachment.url}
              target="_blank"
              rel="noreferrer"
            >
              {bubble.attachment.name}
            </a>
          ) : null}
        </div>
      </div>
    );
  }
  if (bubble.role === "system") {
    return <p className="text-center text-xs text-destructive">{bubble.text}</p>;
  }
  return (
    <div className="space-y-2">
      {bubble.author && (
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">{bubble.author}</p>
      )}
      <p className="whitespace-pre-wrap text-sm text-foreground">{bubble.text}</p>
      {bubble.sources && bubble.sources.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          Based on:{" "}
          {bubble.sources.map((s, i) => (
            <span key={s.sourceId ?? s.articleId ?? `${s.title}-${i}`}>
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
      {(bubble.escalate || bubble.suggestHuman) && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onAction("connect")}
            className={
              bubble.suggestHuman
                ? "rounded-lg px-3 py-2 text-xs font-bold text-white"
                : "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white"
            }
            style={{ background: brand }}
          >
            {bubble.suggestHuman ? "Talk to a representative" : "Connect me"}
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
  initialServiceInterest = "",
}: {
  kind: string;
  config: Config;
  brand: string;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  initialServiceInterest?: string;
}) {
  const [values, setValues] = useState({
    fullName: "",
    phone: "",
    email: "",
    reason: "",
    county: "",
    healthPlan: "",
    serviceInterest: initialServiceInterest,
    preferredLanguage: "English",
    departmentId: "",

    // Pre-checked so visitors get follow-up by default; they can opt out.
    consent: true,
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
      <h2 className="text-sm font-semibold text-foreground">
        {titles[kind] ?? "Request assistance"}
      </h2>
      {!config.businessOpen && (
        <p className="rounded-lg border border-border bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground">
          {afterHoursNotice(config)}
        </p>
      )}
      {(kind === "referral" || kind === "enrollment") && (
        <p className="rounded-lg bg-muted p-2 text-[11px] text-muted-foreground">
          {config.organization.privacyNotice}
        </p>
      )}
      {config.departments?.length ? (
        <label className="block text-xs font-medium text-foreground">
          Which team can help you?
          <select
            value={values.departmentId}
            onChange={(e) => set("departmentId", e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm font-normal"
          >
            <option value="">Choose for me</option>
            {config.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Field
        label="Full name"
        required
        value={values.fullName}
        onChange={(v) => set("fullName", v)}
      />

      <Field
        label="Phone number"
        required
        type="tel"
        value={values.phone}
        onChange={(v) => set("phone", v)}
      />
      <Field
        label="Email address"
        required
        type="email"
        value={values.email}
        onChange={(v) => set("email", v)}
      />
      {(kind === "referral" || kind === "enrollment") && (
        <>
          <Field label="County" value={values.county} onChange={(v) => set("county", v)} />
          <Field
            label="Health plan"
            value={values.healthPlan}
            onChange={(v) => set("healthPlan", v)}
          />
          <Field
            label="Service of interest"
            value={values.serviceInterest}
            onChange={(v) => set("serviceInterest", v)}
          />
          <Field
            label="Preferred language"
            value={values.preferredLanguage}
            onChange={(v) => set("preferredLanguage", v)}
          />
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
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-2 text-sm"
        >
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

/** Shown when the server reports the conversation is resolved, closed or abandoned. */
function EndedNotice({ brand, onRestart }: { brand: string; onRestart: () => void }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 text-center">
      <p className="text-sm font-semibold text-card-foreground">This conversation has ended</p>
      <button
        type="button"
        onClick={onRestart}
        className="mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
        style={{ background: brand }}
      >
        Start a new chat
      </button>
    </div>
  );
}

/** Post-conversation satisfaction rating shown once the chat has some depth. */
function SatisfactionPrompt({
  conversationId,
  brand,
  chatPost,
  onDismiss,
}: {
  conversationId: string;
  brand: string;
  chatPost: (path: string, body: Record<string, unknown>) => Promise<Response>;
  onDismiss: () => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        Thank you — your feedback helps our team improve.
      </div>
    );
  }

  async function submit(value: number, note: string) {
    setDone(true);
    await chatPost("/api/public/chat/rate", {
      conversationId,
      score: value,
      comment: note || null,
    }).catch(() => undefined);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-card-foreground">How helpful was this chat?</p>
        <button
          type="button"
          aria-label="Dismiss rating"
          className="text-[11px] text-muted-foreground hover:underline"
          onClick={onDismiss}
        >
          Not now
        </button>
      </div>
      <div className="mt-2 flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`Rate ${n} out of 5`}
            onClick={() => {
              setScore(n);
              if (n >= 4) void submit(n, "");
            }}
            className="h-8 w-8 rounded-lg border border-border text-xs font-semibold text-foreground transition"
            style={
              score === n ? { background: brand, color: "#fff", borderColor: brand } : undefined
            }
          >
            {n}
          </button>
        ))}
      </div>
      {score !== null && score <= 3 && (
        <div className="mt-2 space-y-2">
          <textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What could we have done better?"
            aria-label="Rating comment"
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-xs"
          />
          <button
            type="button"
            className="w-full rounded-lg px-3 py-2 text-xs font-semibold text-white"
            style={{ background: brand }}
            onClick={() => void submit(score, comment)}
          >
            Send feedback
          </button>
        </div>
      )}
    </div>
  );
}
