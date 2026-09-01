import { resolveWidgetTabs } from "@/lib/widget-tabs";
/**
 * Server-only logic backing the public chat widget endpoints.
 * Uses the service-role client because visitors are anonymous, so every
 * function validates the website + host origin before touching data.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chatComplete, embedText, AiGatewayError, CHAT_MODEL } from "./ai.server";

type Admin = SupabaseClient<any, "public", any>;

let cached: Admin | null = null;
export function admin(): Admin {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Backend is not configured");
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as Admin;
  return cached;
}

export { PublicChatError } from "./public-chat-error";
import { PublicChatError } from "./public-chat-error";

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
  }
}

/** Preview/dev hosts are always allowed so the widget can be tested in Lovable. */
function isTrustedHost(host: string) {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".lovable.app") ||
    host.endsWith(".lovable.dev") ||
    host.endsWith(".lovableproject.com")
  );
}

export async function resolveWebsite(websiteId: string, hostOrigin: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(websiteId)) throw new PublicChatError(400, "Invalid website id");
  const { data: website, error } = await admin()
    .from("websites")
    .select("*")
    .eq("id", websiteId)
    .maybeSingle();
  if (error) throw new PublicChatError(500, "Could not load website configuration");
  if (!website || website.status !== "active") throw new PublicChatError(404, "Website not found");

  assertHostAllowed(website, hostOrigin);
  return website;
}

/** Resolve a website by its public widget key (preferred over raw ids). */
export async function resolveWebsiteByKey(publicKey: string, hostOrigin: string | null) {
  if (!/^cc_pk_[a-f0-9]{16,64}$/i.test(publicKey)) {
    throw new PublicChatError(400, "Invalid widget key");
  }
  const { data: website, error } = await admin()
    .from("websites")
    .select("*")
    .eq("public_key", publicKey)
    .maybeSingle();
  if (error) throw new PublicChatError(500, "Could not load website configuration");
  if (!website || website.status !== "active") throw new PublicChatError(404, "Website not found");
  assertHostAllowed(website, hostOrigin);
  return website;
}

/**
 * Enforce the embedding allow-list. In dev mode Lovable preview hosts and a
 * missing origin are tolerated; once a site is taken out of dev mode the
 * request must come from an explicitly allowed domain.
 */
export function assertHostAllowed(website: Record<string, any>, hostOrigin: string | null) {
  const host = hostOf(hostOrigin);
  const allowed: string[] = website.allowed_domains ?? [];
  const matchesAllowList =
    !!host &&
    allowed.some((d) => {
      const clean = d.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
      return !!clean && (host === clean || host.endsWith(`.${clean}`));
    });

  if (website.dev_mode === false) {
    if (!host) throw new PublicChatError(403, "This chat widget requires a known origin");
    if (!matchesAllowList && !isTrustedHost(host)) {
      throw new PublicChatError(403, "This chat widget is not authorized on this domain");
    }
    return;
  }

  const permitted = !host || isTrustedHost(host) || matchesAllowList;
  if (!permitted) throw new PublicChatError(403, "This chat widget is not authorized on this domain");
}

export async function loadWidgetConfig(websiteId: string, hostOrigin: string | null) {
  const website = await resolveWebsite(websiteId, hostOrigin);
  const db = admin();
  const [
    { data: org },
    { data: services },
    { data: faqs },
    { data: hours },
    { data: departments },
    { data: team },
  ] = await Promise.all([
      db.from("organizations").select("*").eq("id", website.organization_id).maybeSingle(),
      db
        .from("services")
        .select("id,name,short_description,eligibility_overview,counties,health_plans,learn_more_url")
        .eq("organization_id", website.organization_id)
        .eq("status", "active")
        .order("sort_order"),
      db
        .from("faqs")
        .select("id,category,question,answer")
        .eq("organization_id", website.organization_id)
        .eq("status", "active")
        .order("sort_order"),
      db.from("business_hours").select("*").eq("website_id", website.id),
      db
        .from("departments")
        .select("id,name,description,website_id")
        .eq("organization_id", website.organization_id)
        .eq("status", "active")
        .order("name"),
      // Real staff photos only, and only for staff who explicitly opted in.
      // `show_in_widget_team` defaults to false, so no employee photo can ever
      // reach an anonymous visitor by accident.
      db
        .from("profiles")
        .select("id,display_name,full_name,avatar_url")
        .eq("organization_id", website.organization_id)
        .eq("status", "active")
        .eq("show_in_widget_team", true)
        .not("avatar_url", "is", null)
        .limit(3),

    ]);


  const open = isOpenNow(hours ?? [], website.timezone);
  const agentsAvailable = await hasAvailableAgent(website.organization_id);


  return {
    website: {
      id: website.id,
      chatbotName: website.chatbot_name,
      welcomeMessage: website.welcome_message,
      triggerMessage: website.trigger_message,
      triggerDelaySeconds: website.trigger_delay_seconds,
      triggerOncePerVisit: website.trigger_once_per_visit,
      triggerRepeatDays: website.trigger_repeat_days,
      autoOpen: website.auto_open,
      hiddenPaths: website.hidden_paths,
      position: website.widget_position,
      primaryColor: website.primary_color,
      accentColor: website.accent_color,
      logoUrl: website.logo_url,
      agentAvatarUrl: website.agent_avatar_url,
      fontFamily: website.font_family,
      widgetSize: website.widget_size,
      borderRadius: website.border_radius,
      offlineMessage: website.offline_message,
      privacyDisclaimer: website.privacy_disclaimer,
      consentLanguage: website.consent_language,
      menuButtons: (website.menu_buttons as unknown[])?.length
        ? website.menu_buttons
        : DEFAULT_MENU,
      homeGreeting: website.home_greeting ?? "Hi there.",
      homeHeadline: website.home_headline ?? "How can we help?",
      homeSubtitle: website.home_subtitle ?? "CareConnect AI is available anytime.",
      homeCtaTitle: website.home_cta_title ?? "Send us a message",
      homeCtaSubtitle:
        website.home_cta_subtitle ?? "CareConnect AI can help now, or leave a message",
      helpTitle: website.help_title ?? "Search for help",
      privacyFooterText: website.privacy_footer_text ?? "Your privacy matters to us.",
      showHomeTab: website.show_home_tab !== false,
      showHelpTab: website.show_help_tab !== false,
      showServicesTab: website.show_services_tab !== false,
      showRequestsTab: website.show_requests_tab !== false,
      tabs: resolveWidgetTabs(website.tab_config),
    },
    organization: {
      name: org?.name ?? "",
      phone: org?.phone ?? "",
      email: org?.email ?? "",
      address: org?.address ?? "",
      privacyNotice: org?.privacy_notice ?? "",
      emergencyMessage: org?.emergency_message ?? "",
    },
    departments: ((departments ?? []) as Array<Record<string, any>>)
      .filter((d) => !d.website_id || d.website_id === website.id)
      .map((d) => ({ id: d.id as string, name: d.name as string, description: d.description ?? null })),
    services: services ?? [],

    faqs: faqs ?? [],
    team: ((team ?? []) as Array<Record<string, any>>)
      .filter((p) => typeof p.avatar_url === "string" && p.avatar_url)
      .map((p) => ({
        id: p.id as string,
        name: (p.display_name || p.full_name || "Team member") as string,
        avatarUrl: p.avatar_url as string,
      })),
    businessOpen: open,
    agentsAvailable: open && agentsAvailable,

  };
}

export const DEFAULT_MENU = [
  { key: "services", label: "Services", icon: "heart" },
  { key: "faq", label: "Frequently Asked Questions", icon: "help" },
  { key: "contact", label: "Contact Us", icon: "phone" },
  { key: "referral", label: "Submit a Referral", icon: "send" },
  { key: "enrollment", label: "Enrollment Assistance", icon: "clipboard" },
];

function isOpenNow(hours: Array<Record<string, any>>, timezone: string) {
  if (!hours.length) return true;
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/Los_Angeles",
    hour12: false,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dayMap[parts.weekday as string] ?? now.getDay();
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const today = hours.find((h) => h.day_of_week === dow);
  if (!today || today.is_closed) return false;
  const [oh, om] = String(today.open_time).split(":").map(Number);
  const [ch, cm] = String(today.close_time).split(":").map(Number);
  return minutes >= oh * 60 + om && minutes < ch * 60 + cm;
}

async function hasAvailableAgent(organizationId: string) {
  const { count } = await admin()
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("presence", "available");
  return (count ?? 0) > 0;
}

/* ------------------------------- sessions -------------------------------- */

export async function ensureVisitor(
  website: Record<string, any>,
  sessionToken: string,
  meta: Record<string, any>,
) {
  const db = admin();
  const { data: existing } = await db
    .from("visitors")
    .select("*")
    .eq("session_token", sessionToken)
    .maybeSingle();
  if (existing) {
    await db
      .from("visitors")
      .update({ current_page: meta.currentPage ?? existing.current_page, last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing;
  }
  const { data, error } = await db
    .from("visitors")
    .insert({
      organization_id: website.organization_id,
      website_id: website.id,
      session_token: sessionToken,
      landing_page: meta.landingPage ?? null,
      current_page: meta.currentPage ?? null,
      referrer: meta.referrer ?? null,
      utm_source: meta.utmSource ?? null,
      utm_medium: meta.utmMedium ?? null,
      utm_campaign: meta.utmCampaign ?? null,
      device_type: meta.deviceType ?? null,
      browser: meta.browser ?? null,
    })
    .select("*")
    .single();
  if (error) throw new PublicChatError(500, "Could not start a chat session");
  return data;
}

export async function ensureConversation(
  website: Record<string, any>,
  visitor: Record<string, any>,
  conversationId: string | null,
  subject?: string,
) {
  const db = admin();
  if (conversationId) {
    const { data } = await db
      .from("conversations")
      .select("*")
      .eq("id", conversationId)
      .eq("visitor_id", visitor.id)
      .maybeSingle();
    if (data) return data;
  }
  const { data: dept } = await db
    .from("departments")
    .select("id")
    .eq("organization_id", website.organization_id)
    .eq("is_default", true)
    .maybeSingle();
  const { data, error } = await db
    .from("conversations")
    .insert({
      organization_id: website.organization_id,
      workspace_id: website.workspace_id,
      website_id: website.id,
      visitor_id: visitor.id,
      department_id: dept?.id ?? null,
      subject: subject ?? "Website chat",
      status: "new",
    })
    .select("*")
    .single();
  if (error) throw new PublicChatError(500, "Could not start a conversation");
  await logEvent(data.id, website.organization_id, "conversation_created", "Visitor started a chat");
  return data;
}

/** Client IP for rate-limit bucketing (best effort behind proxies). */
export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 60);
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    "unknown"
  ).slice(0, 60);
}

/**
 * Throttle anonymous widget traffic. Fails open if the counter itself errors,
 * so a database hiccup never blocks a legitimate visitor.
 */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  try {
    const { data, error } = await admin().rpc("bump_rate_limit", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) return;
    if (data === false) {
      throw new PublicChatError(429, "Too many requests. Please wait a moment and try again.");
    }
  } catch (error) {
    if (error instanceof PublicChatError) throw error;
  }
}

export async function logEvent(
  conversationId: string,
  organizationId: string,
  eventType: string,
  detail?: string,
) {
  await admin().from("conversation_events").insert({
    conversation_id: conversationId,
    organization_id: organizationId,
    event_type: eventType,
    detail: detail ?? null,
  });
}

export async function insertMessage(
  conversation: Record<string, any>,
  senderType: "visitor" | "ai" | "agent" | "system",
  body: string,
  senderName?: string,
  metadata: Record<string, unknown> = {},
) {
  const db = admin();
  const { data, error } = await db
    .from("messages")
    .insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      website_id: conversation.website_id,
      sender_type: senderType,
      sender_name: senderName ?? null,
      body,
      metadata,
    })
    .select("*")
    .single();
  if (error) throw new PublicChatError(500, "Could not save the message");
  // A visitor writing into a finished thread reopens it, so it re-enters the
  // queue instead of silently landing in a closed conversation.
  const reopens =
    senderType === "visitor" && ["resolved", "closed"].includes(String(conversation.status));
  await db
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      unread_agent_count:
        senderType === "visitor" ? (conversation.unread_agent_count ?? 0) + 1 : conversation.unread_agent_count,
      ...(reopens ? { status: "follow_up", closed_at: null, resolved_at: null } : {}),
    })
    .eq("id", conversation.id);
  if (reopens) {
    await db.from("conversation_events").insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      event_type: "reopened",
      detail: "Visitor replied after the conversation was closed",
      previous_value: String(conversation.status),
      new_value: "follow_up",
    });
  }
  return data;
}


/* --------------------------------- RAG ----------------------------------- */

const CRISIS_PATTERNS = [
  /suicid/i, /kill myself/i, /overdos/i, /can'?t breathe/i, /chest pain/i,
  /emergency/i, /bleeding/i, /unconscious/i, /want to die/i, /hurt myself/i,
];

export function detectCrisis(text: string) {
  return CRISIS_PATTERNS.some((r) => r.test(text));
}

const LOW_CONFIDENCE_REPLY =
  "I'm not completely confident that I have the correct information for that question. Would you like me to connect you with a representative?";

export type AnswerResult = {
  answer: string;
  sources: Array<{ articleId: string; title: string; url: string | null }>;
  confidence: number;
  escalate: boolean;
  crisis: boolean;
  aiResponseId?: string;
};

export async function answerQuestion(opts: {
  website: Record<string, any>;
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId?: string | null;
}): Promise<AnswerResult> {
  const { website, question } = opts;
  const db = admin();

  const { data: org } = await db
    .from("organizations")
    .select("name, description, phone, email, ai_instructions, emergency_message")
    .eq("id", website.organization_id)
    .maybeSingle();

  if (detectCrisis(question)) {
    return {
      answer:
        (org?.emergency_message ??
          "If this is a medical emergency, please call 911 immediately.") +
        "\n\nI can also connect you with a representative during business hours.",
      sources: [],
      confidence: 1,
      escalate: true,
      crisis: true,
    };
  }

  let matches: Array<Record<string, any>> = [];
  try {
    const embedding = await embedText(question);
    const { data } = await db.rpc("match_knowledge", {
      _org: website.organization_id,
      _website: website.id,
      query_embedding: embedding as unknown as string,
      match_count: 6,
    });
    matches = (data as Array<Record<string, any>>) ?? [];
  } catch (err) {
    if (err instanceof AiGatewayError && (err.status === 429 || err.status === 402)) throw err;
    matches = [];
  }

  const relevant = matches.filter((m) => (m.similarity ?? 0) > 0.25);

  if (!relevant.length) {
    return {
      answer: LOW_CONFIDENCE_REPLY,
      sources: [],
      confidence: 0,
      escalate: true,
      crisis: false,
    };
  }

  const context = relevant
    .map((m, i) => `[Source ${i + 1}] ${m.title}\n${m.content}`)
    .join("\n\n");

  const system = [
    `You are ${website.chatbot_name}, the website assistant for ${org?.name ?? "this organization"}.`,
    org?.description ?? "",
    org?.ai_instructions ?? "",
    website.ai_instructions ?? "",
    "Answer ONLY using the approved sources below. Never invent facts, policies, phone numbers or eligibility rules.",
    "If the sources do not clearly answer the question, say you are not confident and offer a representative.",
    "Never diagnose a condition, recommend treatment, guarantee eligibility, promise enrollment approval, or give legal advice.",
    "Keep answers under 120 words, compassionate, professional and easy to read.",
    `Contact: ${org?.phone ?? ""} ${org?.email ?? ""}`.trim(),
    "",
    "APPROVED SOURCES:",
    context,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chatComplete(
    [
      { role: "system", content: system },
      ...opts.history.slice(-8).map((m) => ({ role: m.role, content: m.content }) as const),
      { role: "user", content: question },
    ],
    {
      temperature: 0.2,
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          answer: { type: "string" },
          confidence: { type: "number" },
          used_sources: { type: "array", items: { type: "integer" } },
        },
        required: ["answer", "confidence", "used_sources"],
      },
    },
  );

  let parsed: { answer: string; confidence: number; used_sources: number[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { answer: raw || LOW_CONFIDENCE_REPLY, confidence: 0.4, used_sources: [] };
  }

  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  const escalate = confidence < 0.5;
  const used = parsed.used_sources?.length
    ? parsed.used_sources.map((n) => relevant[n - 1]).filter(Boolean)
    : relevant.slice(0, 2);

  const sources = Array.from(
    new Map(
      used.map((m) => [
        m.article_id,
        { articleId: m.article_id as string, title: m.title as string, url: (m.source_url ?? null) as string | null },
      ]),
    ).values(),
  );

  return {
    answer: escalate ? LOW_CONFIDENCE_REPLY : parsed.answer,
    sources: escalate ? [] : sources,
    confidence,
    escalate,
    crisis: false,
  };
}

export async function recordAiResponse(params: {
  website: Record<string, any>;
  conversationId: string | null;
  messageId: string | null;
  question: string;
  result: AnswerResult;
}) {
  const { data } = await admin()
    .from("ai_responses")
    .insert({
      organization_id: params.website.organization_id,
      website_id: params.website.id,
      conversation_id: params.conversationId,
      message_id: params.messageId,
      question: params.question,
      answer: params.result.answer,
      sources: params.result.sources,
      confidence: params.result.confidence,
      model: CHAT_MODEL,
      escalated: params.result.escalate,
    })
    .select("id")
    .single();
  return data?.id as string | undefined;
}

/* -------------------------- signed widget sessions ------------------------ */

/**
 * Mint a signed session for a visitor. The visitor session token is generated
 * server-side, so a browser can never claim someone else's session.
 */
export async function startWidgetSession(opts: {
  websiteId?: string | null;
  publicKey?: string | null;
  host: string | null;
  meta: Record<string, any>;
}) {
  const { newSessionId, signSession } = await import("./widget-session.server");
  const website = opts.publicKey
    ? await resolveWebsiteByKey(opts.publicKey, opts.host)
    : await resolveWebsite(String(opts.websiteId ?? ""), opts.host);

  const sid = newSessionId();
  await ensureVisitor(website, sid, opts.meta ?? {});
  const { token, expiresAt } = await signSession({
    sid,
    wid: website.id,
    org: website.organization_id,
    host: opts.host,
  });
  return { token, expiresAt, websiteId: website.id as string };
}

export type SessionContext = {
  claims: import("./widget-session.server").WidgetSessionClaims;
  website: Record<string, any>;
  visitor: Record<string, any>;
};

/** Verify a session token and load the bound website + visitor. */
export async function sessionContext(token: unknown, host: string | null): Promise<SessionContext> {
  const { verifySession } = await import("./widget-session.server");
  const claims = await verifySession(token);
  const db = admin();

  const { data: website } = await db.from("websites").select("*").eq("id", claims.wid).maybeSingle();
  if (!website || website.status !== "active") throw new PublicChatError(404, "Website not found");
  if (website.organization_id !== claims.org) throw new PublicChatError(401, "Chat session is invalid");
  assertHostAllowed(website, host ?? claims.host);

  const { data: visitor } = await db
    .from("visitors")
    .select("*")
    .eq("session_token", claims.sid)
    .eq("website_id", website.id)
    .maybeSingle();
  if (!visitor) throw new PublicChatError(401, "Chat session is no longer valid");

  return { claims, website, visitor };
}

/** Load a conversation only if it belongs to this session's visitor. */
export async function conversationForSession(ctx: SessionContext, conversationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(conversationId)) throw new PublicChatError(400, "Invalid conversation id");
  const { data } = await admin()
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .eq("visitor_id", ctx.visitor.id)
    .eq("organization_id", ctx.claims.org)
    .maybeSingle();
  if (!data) throw new PublicChatError(404, "Conversation not found");
  return data;
}

/* ------------------------------ usage limits ------------------------------ */

export type OrgLimits = {
  monthly_ai_messages: number;
  monthly_ai_tokens: number;
  session_ai_messages_per_minute: number;
  ip_requests_per_minute: number;
  max_prompt_chars: number;
  hard_stop: boolean;
};

const DEFAULT_LIMITS: OrgLimits = {
  monthly_ai_messages: 5000,
  monthly_ai_tokens: 5_000_000,
  session_ai_messages_per_minute: 15,
  ip_requests_per_minute: 60,
  max_prompt_chars: 2000,
  hard_stop: true,
};

export async function orgLimits(organizationId: string): Promise<OrgLimits> {
  const { data } = await admin()
    .from("organization_limits")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return { ...DEFAULT_LIMITS, ...(data ?? {}) } as OrgLimits;
}

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

/** Block AI spend once a tenant passes its monthly allowance. */
export async function enforceAiBudget(organizationId: string, limits: OrgLimits) {
  if (!limits.hard_stop) return;
  const { data } = await admin()
    .from("usage_counters")
    .select("metric, value")
    .eq("organization_id", organizationId)
    .eq("period", currentPeriod());
  const used = new Map((data ?? []).map((r: any) => [r.metric as string, Number(r.value)]));
  if ((used.get("ai_messages") ?? 0) >= limits.monthly_ai_messages) {
    throw new PublicChatError(
      429,
      "This assistant has reached its monthly usage limit. Please contact us directly and we'll help right away.",
    );
  }
  if ((used.get("ai_tokens") ?? 0) >= limits.monthly_ai_tokens) {
    throw new PublicChatError(
      429,
      "This assistant has reached its monthly usage limit. Please contact us directly and we'll help right away.",
    );
  }
}

export async function recordUsage(organizationId: string, metric: string, amount = 1) {
  try {
    await admin().rpc("bump_usage", { _org: organizationId, _metric: metric, _amount: amount });
  } catch {
    /* usage accounting must never break a conversation */
  }
}
