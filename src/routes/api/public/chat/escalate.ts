import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  session: z.string().min(20).max(4000),
  host: z.string().max(300).nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email().max(200),
  reason: z.string().trim().max(1000).optional().nullable(),
  county: z.string().trim().max(80).optional().nullable(),
  healthPlan: z.string().trim().max(120).optional().nullable(),
  serviceInterest: z.string().trim().max(160).optional().nullable(),
  preferredLanguage: z.string().trim().max(60).optional().nullable(),
  consent: z.literal(true),
  departmentId: z.string().uuid().nullable().optional(),
  kind: z.enum(["live_agent", "contact", "referral", "enrollment", "message"]).default("live_agent"),

});

export const Route = createFileRoute("/api/public/chat/escalate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const mod = await import("@/lib/public-chat.server");
        try {
          const parsed = bodySchema.safeParse(await request.json());
          if (!parsed.success) {
            return Response.json(
              { error: "Please check the form and try again.", issues: parsed.error.issues.map((i) => i.path.join(".")) },
              { status: 400 },
            );
          }
          const input = parsed.data;
          const ip = mod.clientIp(request);
          await mod.enforceRateLimit(`esc:ip:${ip}`, 10, 300);
          const ctx = await mod.sessionContext(input.session, input.host ?? null);
          await mod.enforceRateLimit(`esc:s:${ctx.claims.sid}`, 5, 300);
          const website = ctx.website;
          const conversation = input.conversationId
            ? await mod.conversationForSession(ctx, input.conversationId)
            : await mod.ensureConversation(website, ctx.visitor, null);
          const db = mod.admin();

          // De-duplicate contacts on email or phone within the organization.
          const { data: existing } = await db
            .from("contacts")
            .select("id")
            .eq("organization_id", website.organization_id)
            .or(`email.ilike.${input.email},phone.eq.${input.phone}`)
            .maybeSingle();

          const contactPayload = {
            organization_id: website.organization_id,
            website_id: website.id,
            full_name: input.fullName,
            phone: input.phone,
            email: input.email,
            county: input.county ?? null,
            health_plan: input.healthPlan ?? null,
            service_interest: input.serviceInterest ?? null,
            preferred_language: input.preferredLanguage ?? "English",
            consent_given: true,
            consent_at: new Date().toISOString(),
            last_contact_at: new Date().toISOString(),
            lead_status: "new",
          };

          let contactId = existing?.id as string | undefined;
          if (contactId) {
            await db.from("contacts").update(contactPayload).eq("id", contactId);
          } else {
            const { data: created, error } = await db
              .from("contacts")
              .insert(contactPayload)
              .select("id")
              .single();
            if (error) return Response.json({ error: "Could not save your details." }, { status: 500 });
            contactId = created.id;
          }

          // The visitor's chosen department wins; otherwise routing rules, then default.
          const { resolveDepartment } = await import("@/lib/handoff.server");
          const departmentId = await resolveDepartment({
            organizationId: website.organization_id,
            preferredDepartmentId: input.departmentId ?? null,
            matchValue: input.kind,
            currentDepartmentId: conversation.department_id ?? null,
          });

          await db
            .from("conversations")
            .update({
              contact_id: contactId,
              visitor_type: "prospect",
              priority: input.kind === "live_agent" ? "high" : "normal",
              subject: `${input.kind.replace("_", " ")} — ${input.fullName}`,
            })
            .eq("id", conversation.id);



          await mod.insertMessage(
            conversation,
            "system",
            `${input.fullName} requested ${input.kind.replace("_", " ")}. Phone: ${input.phone} · Email: ${input.email}${input.reason ? ` · Reason: ${input.reason}` : ""}`,
            "System",
          );
          await mod.logEvent(
            conversation.id,
            website.organization_id,
            "escalation_requested",
            `Visitor requested ${input.kind.replace("_", " ")}`,
          );

          const typeMap: Record<string, string> = {
            referral: "referral",
            enrollment: "enrollment",
            live_agent: "callback",
            contact: "general",
            message: "general",
          };
          await db.from("intake_requests").insert({
            organization_id: website.organization_id,
            website_id: website.id,
            conversation_id: conversation.id,
            contact_id: contactId,
            department_id: departmentId,
            request_type: typeMap[input.kind] ?? "general",
            priority: input.kind === "live_agent" ? "high" : "normal",
            full_name: input.fullName,
            email: input.email,
            phone: input.phone,
            county: input.county ?? null,
            health_plan: input.healthPlan ?? null,
            service_interest: input.serviceInterest ?? null,
            preferred_language: input.preferredLanguage ?? "English",
            source: "widget",
            notes: input.reason ?? null,
          });

          // Full human hand-off: department routing, staff alerts and — only
          // when that department is configured for round-robin — auto-assignment.
          const { handoffToHumans } = await import("@/lib/handoff.server");
          const { notifyStaff } = await import("@/lib/notifications.server");
          let assigned: { userId: string; fullName: string } | null = null;

          if (input.kind === "live_agent") {
            const handoff = await handoffToHumans({
              conversationId: conversation.id,
              organizationId: website.organization_id,
              websiteId: website.id,
              departmentId,
              matchValue: input.kind,
              currentDepartmentId: conversation.department_id ?? null,
              reason: input.reason ?? `${input.fullName} requested a live representative`,
              visitorLabel: input.fullName,
            });
            assigned = handoff.assigned;
          } else {
            await notifyStaff({
              organizationId: website.organization_id,
              departmentId,
              type: "new_intake",
              severity: "info",
              title: `New ${input.kind.replace("_", " ")} from ${input.fullName}`,
              body: input.reason ?? `${input.email} · ${input.phone}`,
              link: "/intake",
              recordType: "conversations",
              recordId: conversation.id,
            });
          }


          const { count } = await db
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", website.organization_id)
            .eq("presence", "available");

          return Response.json({
            conversationId: conversation.id,
            contactId,
            agentsAvailable: (count ?? 0) > 0,
            assignedAgent: assigned?.fullName ?? null,
          });

        } catch (error) {
          if (error instanceof mod.PublicChatError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          console.error("[chat/escalate]", error);
          return Response.json({ error: "Something went wrong. Please try again." }, { status: 500 });
        }
      },
    },
  },
});
