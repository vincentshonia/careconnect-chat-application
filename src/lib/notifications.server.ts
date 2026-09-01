import { admin } from "@/lib/public-chat.server";
import { alertRecipients } from "@/lib/assignment.server";

type NotifyInput = {
  organizationId: string;
  type: "escalation" | "new_intake" | "sla_breach" | "low_rating";
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
};

const PREF_COLUMN: Record<NotifyInput["type"], string> = {
  escalation: "inapp_escalations",
  new_intake: "inapp_new_intake",
  sla_breach: "inapp_sla_breach",
  low_rating: "inapp_low_rating",
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
  } catch (error) {
    console.warn("[notifications] fan-out failed", error);
  }
}
