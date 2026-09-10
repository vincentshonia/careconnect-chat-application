import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled sweep: flag conversations where a visitor asked for a person and
 * still has no first human reply after the organization's target, and alert
 * the assignee (or the department) once per conversation.
 */
export const Route = createFileRoute("/api/public/hooks/sla-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Shared-secret gate: this endpoint sweeps every tenant, so it must
        // never be callable by an anonymous visitor.
        const provided = request.headers.get("x-careconnect-secret") ?? "";
        const { admin } = await import("@/lib/public-chat.server");
        const { notifyStaff } = await import("@/lib/notifications.server");
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
        for (const o of (orgs ?? []) as { id: string; sla_first_response_minutes: number | null }[]) {
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
          .limit(500);

        type Row = {
          id: string;
          organization_id: string;
          department_id: string | null;
          assigned_to: string | null;
          reference: string;
          requested_agent_at: string | null;
          first_human_requested_at: string | null;
        };
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

        let alerted = 0;
        for (const row of breached) {
          if (alreadyAlerted.has(row.id)) continue;
          const target = targetByOrg.get(row.organization_id) ?? DEFAULT_SLA_MINUTES;
          const minutes = Math.round(waitingMinutes(row) ?? 0);

          // The person who owns it, or the team it belongs to — never everyone.
          const audience = row.assigned_to
            ? { userIds: [row.assigned_to] }
            : row.department_id
              ? { departmentId: row.department_id }
              : null;
          if (!audience) continue;

          await notifyStaff({
            organizationId: row.organization_id,
            type: "sla_breach",
            severity: "warning",
            title: `Conversation ${row.reference} has waited ${minutes} min`,
            body: `No agent reply yet — the first-response target is ${target} minutes.`,
            link: `/inbox?c=${row.id}`,
            recordType: "conversations",
            recordId: row.id,
            ...audience,
          });
          alerted += 1;
        }

        return Response.json({ checked: rows.length, alerted });
      },
    },
  },
});
