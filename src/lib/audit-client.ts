/**
 * Thin browser wrapper: the actual audit row is written by the server function,
 * which checks the caller's permission and stamps the actor and tenant itself.
 */
import { recordAuditFn } from "@/lib/audit.functions";

export type AuditScope = "settings" | "website" | "security" | "organization" | "knowledge";

export async function logAudit(entry: {
  scope: AuditScope;
  action: string;
  recordType?: string | null;
  recordId?: string | null;
  websiteId?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
}) {
  try {
    await recordAuditFn({ data: entry });
  } catch (error) {
    // Never block the user's action on the trail write; the server logs it too.
    console.error("[audit] failed to record", entry.action, error);
  }
}
