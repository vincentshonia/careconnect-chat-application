import { resolveWidgetTabs } from "@/lib/widget-tabs";
/**
 * Server-only logic backing the public chat widget endpoints.
 * Uses the service-role client because visitors are anonymous, so every
 * function validates the website + host origin before touching data.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chatCompleteJson, embedText, AiGatewayError, CHAT_MODEL } from "./ai.server";
import {
  detectCrisis,
  applyConfidenceBand,
  lowConfidenceReply,
  crisisFollowUp,
  emergencyFallback,
  detectLanguage,
  normalizeLanguage,
  type ReplyLanguage,
} from "./ai-confidence";
import { checkGrounding, type GroundingResult } from "./grounding";
import { isOpenNow } from "./business-hours";

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
    return (
      value
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0] || null
    );
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

/**
 * The only origin worth trusting: the one the browser itself reported. API
 * routes carry `Origin`; document/script requests (the /widget page and
 * widget.js) carry `Referer`. Anything the page hands us in a `h` parameter is
 * attacker-controlled and used for analytics only.
 */
export function verifiedOrigin(request: Request): string | null {
  return request.headers.get("origin") ?? request.headers.get("referer") ?? null;
}

/** Full claims of a signed origin proof, or null when missing/invalid. */
export async function originProofClaims(proofToken: unknown, websiteId?: string) {
  if (!proofToken) return null;
  const { verifyOriginProof } = await import("./widget-session.server");
  const claims = await verifyOriginProof(proofToken);
  if (!claims) return null;
  if (websiteId && claims.wid !== websiteId) return null;
  return claims;
}

/** Host proven by a signed origin proof, or null when there is no valid proof. */
export async function provenHost(proofToken: unknown, websiteId?: string): Promise<string | null> {
  if (!proofToken) return null;
  const { verifyOriginProof } = await import("./widget-session.server");
  const claims = await verifyOriginProof(proofToken);
  if (!claims) return null;
  if (websiteId && claims.wid !== websiteId) return null;
  return claims.host;
}

export function matchesAllowedDomains(website: Record<string, any>, host: string | null) {
  const allowed: string[] = website.allowed_domains ?? [];
  return (
    !!host &&
    allowed.some((d) => {
      const clean = String(d)
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, "");
      return !!clean && (host === clean || host.endsWith(`.${clean}`));
    })
  );
}

export async function resolveWebsite(
  websiteId: string,
  hostOrigin: string | null,
  clientHint: string | null = null,
  preview = false,
) {
  if (!/^[0-9a-f-]{36}$/i.test(websiteId)) throw new PublicChatError(400, "Invalid website id");
  const { data: website, error } = await admin()
    .from("websites")
    .select("*")
    .eq("id", websiteId)
    .maybeSingle();
  if (error) throw new PublicChatError(500, "Could not load website configuration");
  if (!website || website.status !== "active") throw new PublicChatError(404, "Website not found");

  // A console preview is authorised by a staff-issued signed proof, not by the
  // embedding domain, so the allow-list check does not apply to it.
  if (!preview) assertHostAllowed(website, hostOrigin, clientHint);
  return website;
}

/** Resolve a website by its public widget key (preferred over raw ids). */
export async function resolveWebsiteByKey(
  publicKey: string,
  hostOrigin: string | null,
  clientHint: string | null = null,
  preview = false,
) {
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
  if (!preview) assertHostAllowed(website, hostOrigin, clientHint);
  return website;
}

/**
 * Enforce the embedding allow-list.
 *
 * Live sites (dev_mode false) are authorized purely from the browser-reported
 * origin: it must match `allowed_domains`. Lovable preview hosts are not
 * accepted there, and the client-supplied hint is ignored. Sites still in dev
 * mode keep the tolerant behaviour so the widget can be tried from previews.
 */
export function assertHostAllowed(
  website: Record<string, any>,
  hostOrigin: string | null,
  clientHint: string | null = null,
) {
  if (website.dev_mode === false) {
    const host = hostOf(hostOrigin);
    if (!host) throw new PublicChatError(403, "This chat widget requires a known origin");
    if (!matchesAllowedDomains(website, host)) {
      throw new PublicChatError(403, "This chat widget is not authorized on this domain");
    }
    return;
  }

  const host = hostOf(hostOrigin ?? clientHint);
  const permitted = !host || isTrustedHost(host) || matchesAllowedDomains(website, host);
  if (!permitted)
    throw new PublicChatError(403, "This chat widget is not authorized on this domain");
}

/**
 * Widget settings change rarely but are fetched on every page view, so keep a
 * short per-worker copy. Serverless workers come and go, so this is a
 * best-effort cache: a stale entry can only be up to a minute old.
 */
const WIDGET_CONFIG_TTL_MS = 60_000;
const widgetConfigCache = new Map<
  string,
  { at: number; value: Awaited<ReturnType<typeof buildWidgetConfig>> }
>();

export async function loadWidgetConfig(
  websiteId: string,
  hostOrigin: string | null,
  clientHint: string | null = null,
  preview = false,
) {
  // The host check must run on every request, so it stays outside the cache.
  const cached = widgetConfigCache.get(websiteId);
  if (cached && Date.now() - cached.at < WIDGET_CONFIG_TTL_MS) {
    await resolveWebsite(websiteId, hostOrigin, clientHint, preview);
    return cached.value;
  }
  const value = await buildWidgetConfig(websiteId, hostOrigin, clientHint, preview);
  widgetConfigCache.set(websiteId, { at: Date.now(), value });
  return value;
}

async function buildWidgetConfig(
  websiteId: string,
  hostOrigin: string | null,
  clientHint: string | null = null,
  preview = false,
) {
  const website = await resolveWebsite(websiteId, hostOrigin, clientHint, preview);
  const db = admin();
  const [
    { data: org },
    { data: services },
    { data: faqs },
    { data: hours },
    { data: holidays },
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
    // Hours are configured at organization level in the admin UI, so read
    // the organization rows and keep any that are not scoped to another
    // website or to a specific department.
    db
      .from("business_hours")
      .select("*")
      .eq("organization_id", website.organization_id)
      .is("department_id", null)
      .or(`website_id.is.null,website_id.eq.${website.id}`),
    db
      .from("holidays")
      .select("holiday_date,website_id")
      .eq("organization_id", website.organization_id)
      .or(`website_id.is.null,website_id.eq.${website.id}`),
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

  // The organization clock is the single source of truth for open/closed.
  const open = isOpenNow((hours ?? []) as any, (holidays ?? []) as any, org?.timezone);
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
      .map((d) => ({
        id: d.id as string,
        name: d.name as string,
        description: d.description ?? null,
      })),
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
  isPreview = false,
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
      .update({
        current_page: meta.currentPage ?? existing.current_page,
        last_seen_at: new Date().toISOString(),
      })
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
      preferred_language: meta.language ?? null,
      is_preview: isPreview,
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
      // Console preview chats never enter the live queue or any report.
      is_preview: visitor.is_preview === true,
    })
    .select("*")
    .single();
  if (error) throw new PublicChatError(500, "Could not start a conversation");
  await logEvent(
    data.id,
    website.organization_id,
    "conversation_created",
    "Visitor started a chat",
  );
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
 * Throttle anonymous widget traffic. Fails CLOSED: if the counter itself cannot
 * be read the endpoint is refused with 503, because an unmetered public endpoint
 * is a worse outcome than a short outage. The cause is always logged.
 */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number) {
  let allowed: boolean | null = null;
  try {
    const { data, error } = await admin().rpc("bump_rate_limit", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("rate limit counter failed", { key, error: error.message });
      throw new PublicChatError(503, "Service temporarily unavailable. Please try again shortly.");
    }
    allowed = data !== false;
  } catch (error) {
    if (error instanceof PublicChatError) throw error;
    console.error("rate limit counter threw", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new PublicChatError(503, "Service temporarily unavailable. Please try again shortly.");
  }
  if (!allowed) {
    throw new PublicChatError(429, "Too many requests. Please wait a moment and try again.");
  }
}

export async function logEvent(
  conversationId: string,
  organizationId: string,
  eventType: string,
  detail?: string,
) {
  await admin()
    .from("conversation_events")
    .insert({
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
  const { decideReopen } = await import("@/lib/conversation-reopen");
  const previousAssignee: string | null = conversation.assigned_to ?? null;
  let assigneePresence: string | null = null;
  if (previousAssignee) {
    const { data: profile } = await db
      .from("profiles")
      .select("presence")
      .eq("id", previousAssignee)
      .maybeSingle();
    assigneePresence = (profile as { presence?: string } | null)?.presence ?? null;
  }
  const decision = decideReopen({
    senderType,
    status: String(conversation.status),
    assignedTo: previousAssignee,
    assigneePresence,
    firstHumanRequestedAt: (conversation.first_human_requested_at as string | null) ?? null,
  });
  const now = new Date().toISOString();
  await db
    .from("conversations")
    .update({
      last_message_at: now,
      unread_agent_count:
        senderType === "visitor"
          ? (conversation.unread_agent_count ?? 0) + 1
          : conversation.unread_agent_count,
    })
    .eq("id", conversation.id);

  if (decision.reopens) {
    // The original resolution and closing times are history — the lifecycle
    // routine leaves them alone and records the return visit separately.
    const { transitionConversation } = await import("@/lib/lifecycle.server");
    await transitionConversation({
      conversationId: conversation.id,
      event: "reopen",
      db,
      payload: {
        to_human: decision.toHuman,
        keep_assignee: decision.keepAssignee,
        detail: decision.keepAssignee
          ? "Visitor replied after the conversation was closed"
          : "Visitor replied after the conversation was closed — returned to the queue",
      },
    });
  }
  if (decision.reopens && decision.toHuman) {
    const { notifyStaff } = await import("@/lib/notifications.server");
    await notifyStaff({
      organizationId: conversation.organization_id,
      type: "escalation",
      severity: "warning",
      title: `Conversation ${conversation.reference ?? ""} was reopened`.trim(),
      body: "A visitor replied after this conversation was finished.",
      link: `/inbox?c=${conversation.id}`,
      recordType: "conversations",
      recordId: conversation.id,
      ...(decision.keepAssignee && previousAssignee
        ? { userIds: [previousAssignee] }
        : conversation.department_id
          ? { departmentId: conversation.department_id as string }
          : {}),
    });
  }
  // A visitor writing into a chat somebody already owns is the single most
  // time-sensitive event an agent has, so the owner is told directly.
  if (senderType === "visitor" && previousAssignee && !decision.reopens) {
    const { notifyStaff } = await import("@/lib/notifications.server");
    await notifyStaff({
      organizationId: conversation.organization_id,
      type: "visitor_reply",
      severity: "info",
      title: `New visitor message on ${conversation.reference ?? "a conversation"}`,
      body: body.slice(0, 140),
      link: `/inbox?c=${conversation.id}`,
      recordType: "conversations",
      recordId: conversation.id,
      userIds: [previousAssignee],
    });
  }
  // Nobody owns the chat yet but a person is waiting in the queue: every member
  // of the owning department hears it, not just whoever happens to be looking.
  // Throttled to one alert per conversation per two minutes so a visitor typing
  // several short lines does not chime the whole team repeatedly.
  if (
    senderType === "visitor" &&
    !previousAssignee &&
    !decision.reopens &&
    ["waiting", "escalated", "follow_up"].includes(String(conversation.status))
  ) {
    const since = new Date(Date.now() - 2 * 60_000).toISOString();
    const { count } = await db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("record_id", conversation.id)
      .eq("type", "visitor_reply")
      .gte("created_at", since);
    if (!count) {
      const { notifyStaff } = await import("@/lib/notifications.server");
      await notifyStaff({
        organizationId: conversation.organization_id,
        type: "visitor_reply",
        severity: "warning",
        title: `Visitor waiting on ${conversation.reference ?? "a conversation"}`,
        body: body.slice(0, 140),
        link: `/inbox?c=${conversation.id}`,
        recordType: "conversations",
        recordId: conversation.id,
        ...(conversation.department_id
          ? { departmentId: conversation.department_id as string }
          : {}),
      });
    }
  }
  return data;
}

/* --------------------------------- RAG ----------------------------------- */

export {
  CRISIS_PATTERNS,
  CRISIS_PATTERNS_ES,
  detectCrisis,
  LOW_CONFIDENCE_REPLY,
  HEDGE_PREFIX,
  applyConfidenceBand,
  normalizeLanguage,
} from "./ai-confidence";

/**
 * Relevance floor for retrieved chunks.
 *
 * Fusion scores are rank-based, so the best chunk always scores about the same
 * whether or not it has anything to do with the question — calibration against
 * Pacific Health Group's content showed an off-topic question ("how do I bake
 * sourdough bread?") topping out at the same 0.032 as a real one. So fusion is
 * used for ordering only, and a chunk must additionally clear one of the raw
 * scores: meaning-similarity 0.30, or word/fuzzy match 0.18. In calibration the
 * off-topic question peaked at 0.069 similarity and 0.094 text, so it retrieves
 * nothing, while "what is your phone number?" still reaches the contact page
 * (0.326) and "what counties do you serve?" the counties FAQ (0.636).
 */
export const MIN_SIMILARITY = 0.3;
export const MIN_TEXT_SCORE = 0.18;

export type AnswerDiagnostics = {
  retrieval: Array<{ title: string; fused: number; similarity: number; text: number }>;
  floor: number;
  grounding?: Pick<GroundingResult, "grounded" | "reason" | "removed" | "supported">;
  parse_error?: string | null;
  parse_retried?: boolean;
  language?: ReplyLanguage;
};

export type AnswerResult = {
  answer: string;
  sources: Array<{
    articleId: string | null;
    sourceType?: string;
    sourceId?: string;
    title: string;
    url: string | null;
  }>;
  confidence: number;
  escalate: boolean;
  crisis: boolean;
  aiResponseId?: string;
  diagnostics?: AnswerDiagnostics;
};

/**
 * What language should the assistant reply in? An explicit hint wins, then the
 * linked contact's stated preference, then the browser language the widget
 * recorded for this visitor.
 */
async function resolveLanguage(
  db: Admin,
  conversationId: string | null | undefined,
  hint: string | null | undefined,
  question: string,
): Promise<ReplyLanguage> {
  if (hint) return normalizeLanguage(hint);
  if (!conversationId) return detectLanguage(question);
  const { data } = await db
    .from("conversations")
    .select("contact_id, visitor_id, contacts(preferred_language), visitors(preferred_language)")
    .eq("id", conversationId)
    .maybeSingle();
  const row = data as Record<string, any> | null;
  const stored = row?.contacts?.preferred_language ?? row?.visitors?.preferred_language ?? null;
  return stored ? normalizeLanguage(stored) : detectLanguage(question);
}

export async function answerQuestion(opts: {
  website: Record<string, any>;
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  conversationId?: string | null;
  /** Browser or form language for this visitor, when the caller knows it. */
  language?: string | null;
}): Promise<AnswerResult> {
  const { website, question } = opts;
  const db = admin();

  const { data: org } = await db
    .from("organizations")
    .select("name, description, phone, email, ai_instructions, emergency_message")
    .eq("id", website.organization_id)
    .maybeSingle();

  const language = await resolveLanguage(
    db,
    opts.conversationId ?? null,
    opts.language ?? null,
    question,
  );

  if (detectCrisis(question)) {
    return {
      answer:
        (org?.emergency_message ?? emergencyFallback(language)) + "\n\n" + crisisFollowUp(language),
      sources: [],
      confidence: 1,
      escalate: true,
      crisis: true,
      diagnostics: { retrieval: [], floor: MIN_SIMILARITY, language },
    };
  }

  // Hybrid retrieval: meaning-similarity and word/fuzzy matching, blended by
  // reciprocal rank fusion so an exact plan name or phone number is found even
  // when the embedding misses it.
  let matches: Array<Record<string, any>> = [];
  try {
    const embedding = await embedText(question);
    const { data } = await db.rpc("match_knowledge_hybrid", {
      _org: website.organization_id,
      _website: website.id,
      _embedding: embedding as unknown as string,
      _query: question,
      _k: 6,
    });
    matches = (data as Array<Record<string, any>>) ?? [];
  } catch (err) {
    if (err instanceof AiGatewayError && (err.status === 429 || err.status === 402)) throw err;
    matches = [];
  }

  const relevant = matches.filter(
    (m) =>
      Number(m.similarity ?? 0) >= MIN_SIMILARITY || Number(m.text_score ?? 0) >= MIN_TEXT_SCORE,
  );
  const retrieval = matches.map((m) => ({
    title: String(m.title ?? ""),
    fused: Number(m.fused_score ?? 0),
    similarity: Number(m.similarity ?? 0),
    text: Number(m.text_score ?? 0),
  }));

  if (!relevant.length) {
    return {
      answer: lowConfidenceReply(language),
      sources: [],
      confidence: 0,
      escalate: true,
      crisis: false,
      diagnostics: { retrieval, floor: MIN_SIMILARITY, language },
    };
  }

  const context = relevant.map((m, i) => `[Source ${i + 1}] ${m.title}\n${m.content}`).join("\n\n");

  const system = [
    `You are ${website.chatbot_name}, the website assistant for ${org?.name ?? "this organization"}.`,
    org?.description ?? "",
    org?.ai_instructions ?? "",
    website.ai_instructions ?? "",
    "Answer ONLY using the approved sources below. Never invent facts, policies, phone numbers or eligibility rules.",
    "Only state a phone number, web address, dollar amount or percentage if it appears word-for-word in a source you cite.",
    "If the sources do not clearly answer the question, say you are not confident and offer a representative.",
    "Never diagnose a condition, recommend treatment, guarantee eligibility, promise enrollment approval, or give legal advice.",
    "Keep answers under 120 words, compassionate, professional and easy to read.",
    language === "es"
      ? "Reply in the visitor's language: responda en español."
      : "Reply in the visitor's language.",
    `Contact: ${org?.phone ?? ""} ${org?.email ?? ""}`.trim(),
    "",
    "APPROVED SOURCES:",
    context,
  ]
    .filter(Boolean)
    .join("\n");

  const { parsed, raw, parseError, retried } = await chatCompleteJson<{
    answer: string;
    confidence: number;
    used_sources: number[];
  }>(
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

  const result = parsed ?? {
    answer: raw || lowConfidenceReply(language),
    confidence: 0.4,
    used_sources: [] as number[],
  };

  const used = (result.used_sources ?? []).map((n) => relevant[n - 1]).filter(Boolean);

  // The model's own confidence is only a starting point: an answer that cites
  // nothing, or states a number no cited source contains, is not trustworthy
  // however sure the model sounds.
  const grounding = checkGrounding(
    result.answer ?? "",
    used.map((m) => `${m.title}\n${m.content}`),
    Math.max(0, Math.min(1, Number(result.confidence) || 0)),
  );

  const confidence = grounding.confidence;
  const band = applyConfidenceBand(grounding.answer, confidence, language);

  // Articles, FAQs and services all land here, so identity is the source pair,
  // not the (now optional) article id.
  const sources = Array.from(
    new Map(
      used.map((m) => [
        `${m.source_type ?? "article"}:${m.source_id ?? m.article_id}`,
        {
          articleId: (m.article_id ?? null) as string | null,
          sourceType: (m.source_type ?? "article") as string,
          sourceId: (m.source_id ?? m.article_id) as string,
          title: m.title as string,
          url: (m.source_url ?? null) as string | null,
        },
      ]),
    ).values(),
  );

  return {
    answer: band.answer,
    sources: band.useSources ? sources : [],
    confidence,
    escalate: band.escalate,
    crisis: false,
    diagnostics: {
      retrieval,
      floor: MIN_SIMILARITY,
      grounding: {
        grounded: grounding.grounded,
        reason: grounding.reason,
        removed: grounding.removed,
        supported: grounding.supported,
      },
      parse_error: parseError,
      parse_retried: retried,
      language,
    },
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
      metadata: (params.result.diagnostics ?? {}) as never,
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
/**
 * Best-effort public contact details, used to turn a technical refusal into
 * something a visitor can act on. Never throws.
 */
export async function publicContact(
  websiteId: string,
): Promise<{ phone: string; domain: string; organization: string }> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(websiteId)) return { phone: "", domain: "", organization: "" };
    const db = admin();
    const { data: website } = await db
      .from("websites")
      .select("domain, organization_id")
      .eq("id", websiteId)
      .maybeSingle();
    if (!website) return { phone: "", domain: "", organization: "" };
    const { data: org } = await db
      .from("organizations")
      .select("name, phone")
      .eq("id", website.organization_id)
      .maybeSingle();
    return {
      phone: org?.phone ?? "",
      domain: website.domain ?? "",
      organization: org?.name ?? "",
    };
  } catch {
    return { phone: "", domain: "", organization: "" };
  }
}

export async function startWidgetSession(opts: {
  websiteId?: string | null;
  publicKey?: string | null;
  /** Browser-reported origin of this request (same-origin for the iframe). */
  host: string | null;
  /** Page-supplied origin: analytics only, never trusted for authorization. */
  clientHost?: string | null;
  /** Signed proof of the embedding page's origin, issued by /chat/origin. */
  originProof?: string | null;
  meta: Record<string, any>;
  /** The token being replaced, so a renewal keeps the same visitor. */
  priorSession?: string | null;
}) {
  const { newSessionId, signSession, verifySessionForRenewal, verifyOriginProof } =
    await import("./widget-session.server");
  const clientHint = opts.clientHost ?? null;
  const proof = opts.originProof ? await verifyOriginProof(opts.originProof) : null;
  // The proof was issued after a cross-origin check of the embedding page, so
  // it is the trustworthy host. The request's own origin is only a hint.
  const provenHost = proof?.host ?? null;
  // A staff-issued preview proof authorises the console preview on any host.
  const previewProof = proof?.preview === true;
  const website = opts.publicKey
    ? await resolveWebsiteByKey(opts.publicKey, provenHost, clientHint ?? opts.host, previewProof)
    : await resolveWebsite(
        String(opts.websiteId ?? ""),
        provenHost,
        clientHint ?? opts.host,
        previewProof,
      );

  const isPreview = previewProof && proof?.wid === website.id;

  if (!isPreview && website.dev_mode === false && proof?.wid !== website.id) {
    throw new PublicChatError(403, "This chat widget is not authorized on this domain");
  }

  // A renewal presents its previous token. When that token is genuine (even if
  // it expired in the last week) and belongs to this website, the visitor is
  // the same person — reuse their session id so their conversations survive.
  let sid: string | null = null;
  if (opts.priorSession) {
    try {
      const prior = await verifySessionForRenewal(opts.priorSession);
      if (prior.wid === website.id && prior.org === website.organization_id) sid = prior.sid;
    } catch {
      sid = null;
    }
  }
  sid = sid ?? newSessionId();
  await ensureVisitor(website, sid, opts.meta ?? {}, isPreview);
  const { token, expiresAt } = await signSession({
    sid,
    wid: website.id,
    org: website.organization_id,
    // Store the *proven* host so later endpoints authorize against a value the
    // browser proved, not one the page claimed.
    host:
      website.dev_mode === false ? provenHost : (provenHost ?? opts.clientHost ?? opts.host),
    ...(isPreview ? { preview: true } : {}),
  });
  return { token, expiresAt, websiteId: website.id as string };
}

export type SessionContext = {
  claims: import("./widget-session.server").WidgetSessionClaims;
  website: Record<string, any>;
  visitor: Record<string, any>;
};

/**
 * Authorize an *established* session.
 *
 * For live sites the authority is `claims.host`: the host proven by a signed
 * origin proof when the session was minted. The request's own `Origin` is only
 * a secondary check — the widget iframe is served from our origin and a
 * redirect hop can strip the header entirely, so its absence must never revoke
 * a session that was proven at mint time.
 */
export function assertSessionHostAllowed(
  website: Record<string, any>,
  claimsHost: string | null,
  requestHost: string | null,
  preview = false,
) {
  // Console previews are authorised by a staff-issued proof, not by domain.
  if (preview) return;
  if (website.dev_mode === false) {
    const proven = hostOf(claimsHost);
    if (!proven || !matchesAllowedDomains(website, proven)) {
      throw new PublicChatError(403, "This chat widget is not authorized on this domain");
    }
    const reported = hostOf(requestHost);
    if (reported && !isTrustedHost(reported) && !matchesAllowedDomains(website, reported)) {
      throw new PublicChatError(403, "This chat widget is not authorized on this domain");
    }
    return;
  }
  assertHostAllowed(website, requestHost, claimsHost);
}

/**
 * Verify a session token and load the bound website + visitor. `host` is the
 * browser-reported origin; authorization for live sites comes from the proven
 * host stored in the session claims.
 */
export async function sessionContext(token: unknown, host: string | null): Promise<SessionContext> {
  const { verifySession } = await import("./widget-session.server");
  const claims = await verifySession(token);
  const db = admin();

  const { data: website } = await db
    .from("websites")
    .select("*")
    .eq("id", claims.wid)
    .maybeSingle();
  if (!website || website.status !== "active") throw new PublicChatError(404, "Website not found");
  if (website.organization_id !== claims.org)
    throw new PublicChatError(401, "Chat session is invalid");
  assertSessionHostAllowed(website, claims.host ?? null, host, claims.preview === true);

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
  if (!/^[0-9a-f-]{36}$/i.test(conversationId))
    throw new PublicChatError(400, "Invalid conversation id");
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

/**
 * Merge a stored limits row over the defaults, field by field, COALESCE-style:
 * a null column means "not configured", never "zero". A plain object spread
 * would let a single null disable a limit or reject every message.
 */
export function mergeOrgLimits(row: Partial<Record<keyof OrgLimits, unknown>> | null): OrgLimits {
  const merged = { ...DEFAULT_LIMITS };
  if (!row) return merged;
  for (const field of Object.keys(DEFAULT_LIMITS) as Array<keyof OrgLimits>) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    if (field === "hard_stop") {
      if (typeof value === "boolean") merged.hard_stop = value;
      continue;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) (merged[field] as number) = numeric;
  }
  return merged;
}

/* --------------------------- embedding permissions ------------------------ */

const frameAncestorsCache = new Map<string, { at: number; value: string[] }>();

/**
 * Domains permitted to embed the widget page, used to build its
 * `frame-ancestors` policy. Empty when the website cannot be resolved.
 */
export async function widgetFrameAncestors(websiteId: string): Promise<string[]> {
  if (!/^[0-9a-f-]{36}$/i.test(websiteId)) return [];
  const cached = frameAncestorsCache.get(websiteId);
  if (cached && Date.now() - cached.at < WIDGET_CONFIG_TTL_MS) return cached.value;
  const { data } = await admin()
    .from("websites")
    .select("allowed_domains, dev_mode")
    .eq("id", websiteId)
    .maybeSingle();
  if (!data) return [];
  const domains: string[] = (data.allowed_domains ?? [])
    .map((d: string) =>
      String(d)
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/\/$/, ""),
    )
    .filter(Boolean)
    .flatMap((d: string) => [`https://${d}`, `https://*.${d}`]);
  if (data.dev_mode !== false)
    domains.push("https://*.lovable.app", "https://*.lovable.dev", "http://localhost:*");
  frameAncestorsCache.set(websiteId, { at: Date.now(), value: domains });
  return domains;
}

export async function orgLimits(organizationId: string): Promise<OrgLimits> {
  const { data } = await admin()
    .from("organization_limits")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  return mergeOrgLimits((data ?? null) as Partial<Record<keyof OrgLimits, unknown>> | null);
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
