import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled sweep: flag conversations that have waited longer than the
 * organization's first-response target and alert staff once per conversation.
 */
export const Route = createFileRoute("/api/public/hooks/sla-check")({
  server: {
    handlers: {
      POST: async () => {
        const { admin } = await import("@/lib/public-chat.server");
        const { notifyStaff } = await import("@/lib/notifications.server");
        const db = admin();

        const { data: prefs } = await db
          .from("notification_preferences")
          .select("organization_id, sla_first_response_minutes");
        const targetByOrg = new Map<string, number>();
        for (const p of prefs ?? []) {
          const org = (p as { organization_id: string | null }).organization_id;
          const minutes = (p as { sla_first_response_minutes: number }).sla_first_response_minutes;
          if (!org) continue;
          targetByOrg.set(org, Math.min(targetByOrg.get(org) ?? minutes, minutes));
        }

        const { data: waiting } = await db
          .from("conversations")
          .select("id, organization_id, reference, created_at, first_response_at, status")
          .is("first_response_at", null)
          .in("status", ["waiting", "new", "escalated", "assigned"])
          .limit(500);

        let alerted = 0;
        for (const c of waiting ?? []) {
          const row = c as {
            id: string;
            organization_id: string;
            reference: string;
            created_at: string;
          };
          const target = targetByOrg.get(row.organization_id) ?? 15;
          const ageMinutes = (Date.now() - new Date(row.created_at).getTime()) / 60000;
          if (ageMinutes < target) continue;

          const { data: existing } = await db
            .from("notifications")
            .select("id")
            .eq("record_id", row.id)
            .eq("type", "sla_breach")
            .limit(1);
          if (existing && existing.length > 0) continue;

          await notifyStaff({
            organizationId: row.organization_id,
            type: "sla_breach",
            severity: "warning",
            title: `Conversation ${row.reference} has waited ${Math.round(ageMinutes)} min`,
            body: `No agent reply yet — the first-response target is ${target} minutes.`,
            link: "/inbox",
            recordType: "conversations",
            recordId: row.id,
          });
          alerted += 1;
        }

        return Response.json({ checked: (waiting ?? []).length, alerted });
      },
    },
  },
});
