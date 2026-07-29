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


/**
 * Fan a notification out to every staff member in the organization who opted in.
 * Never throws — alerting must not break the action that triggered it.
 */
export async function notifyStaff(input: NotifyInput) {
  try {
    const db = admin();
    const { data: staff } = await db
      .from("profiles")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("status", "active");

    const ids = (staff ?? []).map((s: { id: string }) => s.id);
    if (ids.length === 0) return;

    const { data: prefs } = await db
      .from("notification_preferences")
      .select("*")
      .in("user_id", ids);

    const prefByUser = new Map<string, Record<string, unknown>>(
      (prefs ?? []).map((p: Record<string, unknown>) => [p.user_id as string, p]),
    );
    const column = PREF_COLUMN[input.type];

    const rows = ids
      .filter((id) => {
        const p = prefByUser.get(id);
        return p ? p[column] !== false : true; // default: opted in
      })
      .map((id) => ({
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

    if (rows.length) await db.from("notifications").insert(rows);
  } catch (error) {
    console.warn("[notifications] fan-out failed", error);
  }
}
