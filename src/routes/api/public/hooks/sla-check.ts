import { createFileRoute } from "@tanstack/react-router";

/** Hard cap per run, so a backlog can never make one call run long. */
const MAX_CANDIDATES = 200;
/** Insert size per round-trip. */
const INSERT_BATCH = 500;
/** Above this, the run is slow enough to be worth a log line. */
const SLOW_RUN_MS = 4000;

type Row = {
  id: string;
  organization_id: string;
  department_id: string | null;
  assigned_to: string | null;
  reference: string;
  requested_agent_at: string | null;
  first_human_requested_at: string | null;
};

/**
 * Scheduled sweep: flag conversations where a visitor asked for a person and
 * still has no first human reply after the organization's target, and alert
 * the assignee (or the department) once per conversation.
 *
 * Everything is done in batched queries — no per-conversation round trips —
 * so the run finishes well inside the caller's HTTP timeout.
 */
export const Route = createFileRoute("/api/public/hooks/sla-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        // Shared-secret gate: this endpoint sweeps every tenant, so it must
        // never be callable by an anonymous visitor.
        const provided = request.headers.get("x-careconnect-secret") ?? "";
        const { admin } = await import("@/lib/public-chat.server");
        const { alertRecipients } = await import("@/lib/assignment.server");
        const { DEFAULT_SLA_MINUTES, waitingMinutes } = await import("@/lib/sla");
        const db = admin();

        const { data: tokenRow } = await db
          .from("internal_tokens")
          .select("token")
          .eq("name", "sla_check")
          .maybeSingle();
        const accepted = [tokenRow?.token, process.env.INTERNAL_WEBHOOK_SECRET].filter(
          (v): v is string => typeof v === "string" && v.length > 0,
        );
        const authorized = accepted.some(
          (secret) => provided.length === secret.length && provided === secret,
        );
        if (!authorized) return new Response("Unauthorized", { status: 401 });

        // Each organization sets its own first-response target.
        const { data: orgs } = await db
          .from("organizations")
          .select("id, sla_first_response_minutes");
        const targetByOrg = new Map<string, number>();
        for (const o of (orgs ?? []) as {
          id: string;
          sla_first_response_minutes: number | null;
        }[]) {
          targetByOrg.set(o.id, o.sla_first_response_minutes ?? DEFAULT_SLA_MINUTES);
        }

        // Only chats where a person was asked for and nobody has answered yet:
        // either still unclaimed, or claimed but without a first agent reply.
        const { data: waiting } = await db
          .from("conversations")
          .select(
            "id, organization_id, department_id, assigned_to, reference, requested_agent_at, first_human_requested_at, status",
          )
          .eq("escalation_requested", true)
          .in("status", ["waiting", "escalated", "assigned", "follow_up"])
          .or("assigned_to.is.null,first_agent_response_at.is.null")
          .order("requested_agent_at", { ascending: true, nullsFirst: true })
          .limit(MAX_CANDIDATES);

        const rows = (waiting ?? []) as Row[];

        const breached = rows.filter((row) => {
          const minutes = waitingMinutes(row);
          if (minutes === null) return false;
          return minutes >= (targetByOrg.get(row.organization_id) ?? DEFAULT_SLA_MINUTES);
        });

        // One lookup for the whole batch instead of a query per conversation.
        const alreadyAlerted = new Set<string>();
        if (breached.length > 0) {
          const { data: existing } = await db
            .from("notifications")
            .select("record_id")
            .eq("type", "sla_breach")
            .in(
              "record_id",
              breached.map((row) => row.id),
            );
          for (const n of (existing ?? []) as { record_id: string | null }[]) {
            if (n.record_id) alreadyAlerted.add(n.record_id);
          }
        }

        const pending = breached.filter((row) => !alreadyAlerted.has(row.id));

        // Resolve eligible recipients once per (organization, department) pair
        // rather than once per conversation.
        const audienceCache = new Map<string, string[]>();
        async function recipients(organizationId: string, departmentId: string | null) {
          const key = `${organizationId}:${departmentId ?? ""}`;
          const cached = audienceCache.get(key);
          if (cached) return cached;
          const ids = await alertRecipients(organizationId, departmentId, "inapp_sla_breach");
          audienceCache.set(key, ids);
          return ids;
        }

        const notificationRows: Record<string, unknown>[] = [];
        const notifiedConversations = new Set<string>();

        for (const row of pending) {
          const target = targetByOrg.get(row.organization_id) ?? DEFAULT_SLA_MINUTES;
          const minutes = Math.round(waitingMinutes(row) ?? 0);

          // The person who owns it, or the team it belongs to — never everyone.
          let ids: string[];
          if (row.assigned_to) {
            const eligible = new Set(await recipients(row.organization_id, null));
            ids = eligible.has(row.assigned_to) ? [row.assigned_to] : [];
          } else if (row.department_id) {
            ids = await recipients(row.organization_id, row.department_id);
          } else {
            ids = [];
          }
          if (ids.length === 0) continue;

          for (const userId of ids) {
            notificationRows.push({
              organization_id: row.organization_id,
              user_id: userId,
              type: "sla_breach",
              severity: "warning",
              title: `Conversation ${row.reference} has waited ${minutes} min`,
              body: `No agent reply yet — the first-response target is ${target} minutes.`,
              link: `/inbox?c=${row.id}`,
              record_type: "conversations",
              record_id: row.id,
            });
          }
          notifiedConversations.add(row.id);
        }

        for (let i = 0; i < notificationRows.length; i += INSERT_BATCH) {
          const { error } = await db
            .from("notifications")
            .insert(notificationRows.slice(i, i + INSERT_BATCH));
          if (error) {
            console.warn("[sla-check] notification batch insert failed", error);
            break;
          }
        }

        const durationMs = Date.now() - startedAt;
        if (durationMs > SLOW_RUN_MS) {
          console.warn(
            `[sla-check] slow run: ${durationMs}ms for ${rows.length} candidates, ${notifiedConversations.size} notified`,
          );
        }

        return Response.json({
          processed: rows.length,
          notified: notifiedConversations.size,
          durationMs,
        });
      },
    },
  },
});
