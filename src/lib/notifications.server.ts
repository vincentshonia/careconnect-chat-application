import { admin } from "@/lib/public-chat.server";
import { alertRecipients } from "@/lib/assignment.server";
import {
  EMAIL_PREF_COLUMN,
  consoleLink,
  emailIdempotencyKey,
  isChatAlertType,
  ringCentralText,
  type ChatAlertType,
} from "@/lib/notify-channels";

type NotifyInput = {
  organizationId: string;
  type: "escalation" | "new_intake" | "sla_breach" | "low_rating" | "visitor_reply";
  title: string;
  body?: string | null;
  link?: string | null;
  severity?: "info" | "warning" | "critical";
  recordType?: string | null;
  recordId?: string | null;
  /** Scope the alert to one department's members; falls back to the whole org. */
  departmentId?: string | null;
  /** Explicit recipients (e.g. the agent a chat was just assigned to). */
  userIds?: string[];
  /** Best-known visitor name, used in the RingCentral alert only. */
  visitorName?: string | null;

};

const PREF_COLUMN: Record<NotifyInput["type"], string> = {
  escalation: "inapp_escalations",
  new_intake: "inapp_new_intake",
  sla_breach: "inapp_sla_breach",
  low_rating: "inapp_low_rating",
  // Visitor replies follow the same opt-in as escalations: both mean "a person
  // is waiting on you in the inbox".
  visitor_reply: "inapp_escalations",
};

/** Insert size cap per round-trip, so large teams do not produce one giant statement. */
const INSERT_BATCH = 500;

/**
 * Fan a notification out to eligible staff.
 *
 * Eligibility (active membership, active profile, department membership,
 * opted-in preference) is resolved in PostgreSQL, and rows are inserted in
 * bounded batches. Never throws — alerting must not break the action that
 * triggered it.
 */
export async function notifyStaff(input: NotifyInput) {
  try {
    const db = admin();
    const column = PREF_COLUMN[input.type];

    let ids: string[];
    if (input.userIds?.length) {
      // Explicit recipients still have to be eligible.
      const eligible = new Set(await alertRecipients(input.organizationId, null, column));
      ids = input.userIds.filter((id) => eligible.has(id));
    } else {
      ids = await alertRecipients(input.organizationId, input.departmentId ?? null, column);
    }
    if (ids.length === 0) return;

    const rows = ids.map((id) => ({
      organization_id: input.organizationId,
      user_id: id,
      type: input.type,
      severity: input.severity ?? "info",
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      record_type: input.recordType ?? null,
      record_id: input.recordId ?? null,
    }));

    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const { error } = await db.from("notifications").insert(rows.slice(i, i + INSERT_BATCH));
      if (error) {
        console.warn("[notifications] batch insert failed", error);
        break;
      }
    }

    // Email + RingCentral ride on the same event, but never on its failure.
    await fanOutExternal(input);
  } catch (error) {
    console.warn("[notifications] fan-out failed", error);
  }
}

/**
 * Extra channels for the three "a chat needs a human" events: an email to the
 * owning department's members (or the assigned agent), and one post into the
 * department's RingCentral channel. Every step is best-effort.
 */
async function fanOutExternal(input: NotifyInput) {
  try {
    if (!isChatAlertType(input.type)) return;
    const type = input.type as ChatAlertType;
    const conversationId = input.recordType === "conversations" ? (input.recordId ?? null) : null;
    const link = consoleLink(input.recordType, input.recordId);

    const db = admin();
    let departmentName: string | null = null;
    let ringChatId: string | null = null;
    if (input.departmentId) {
      const { data: dept } = await db
        .from("departments")
        .select("name, ringcentral_chat_id")
        .eq("id", input.departmentId)
        .maybeSingle();
      departmentName = dept?.name ?? null;
      ringChatId = dept?.ringcentral_chat_id ?? null;
    }

    let reference: string | null = null;
    if (conversationId) {
      const { data: conv } = await db
        .from("conversations")
        .select("reference")
        .eq("id", conversationId)
        .maybeSingle();
      reference = conv?.reference ?? null;
    }

    await emailAlert({ input, type, conversationId, link, departmentName, reference });

    // Exactly one post per event: only the department-scoped call posts, never
    // the follow-up call that targets the assigned agent.
    if (input.departmentId && !input.userIds?.length && ringChatId) {
      const { isRingCentralConfigured, postToChat } = await import("@/lib/ringcentral.server");
      if (isRingCentralConfigured()) {
        await postToChat(
          ringChatId,
          ringCentralText({
            departmentName,
            title: input.title,
            link,
            visitorName: input.visitorName ?? null,
          }),
          {
            organizationId: input.organizationId,
            departmentId: input.departmentId,
            departmentName,
          },
        );

      }
    }
  } catch (error) {
    console.warn("[notifications] external channels failed", error);
  }
}

async function emailAlert(args: {
  input: NotifyInput;
  type: ChatAlertType;
  conversationId: string | null;
  link: string;
  departmentName: string | null;
  reference: string | null;
}) {
  try {
    const { input, type, conversationId, link, departmentName, reference } = args;
    const column = EMAIL_PREF_COLUMN[type];

    let ids: string[];
    if (input.userIds?.length) {
      const eligible = new Set(await alertRecipients(input.organizationId, null, column));
      ids = input.userIds.filter((id) => eligible.has(id));
    } else {
      ids = await alertRecipients(input.organizationId, input.departmentId ?? null, column);
    }
    if (ids.length === 0) return;

    const db = admin();
    const { data: people } = await db
      .from("profiles")
      .select("id, email")
      .in("id", ids.slice(0, INSERT_BATCH));
    const recipients = (people ?? []).filter((p) => Boolean(p.email));
    if (recipients.length === 0) return;

    const { data: org } = await db
      .from("organizations")
      .select("name")
      .eq("id", input.organizationId)
      .maybeSingle();

    const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
    for (const person of recipients) {
      try {
        await sendTemplateEmail("staff-chat-alert", person.email!, {
          idempotencyKey: emailIdempotencyKey(conversationId, person.id, type),
          templateData: {
            departmentName,
            reason: input.title,
            referenceId: reference,
            conversationUrl: link,
            organizationName: org?.name ?? "Pacific Health Group",
          },
        });
      } catch (error) {
        console.warn("[notifications] alert email failed", error);
      }
    }
  } catch (error) {
    console.warn("[notifications] email fan-out failed", error);
  }
}

