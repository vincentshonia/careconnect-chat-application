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
  /**
   * Client hint only. The authoritative value is recomputed on the server from
   * the organization's hours, holidays and timezone.
   */
  after_hours: z.boolean().optional().default(false),

  kind: z
    .enum(["live_agent", "contact", "referral", "enrollment", "message"])
    .default("live_agent"),
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
              {
                error: "Please check the form and try again.",
                issues: parsed.error.issues.map((i) => i.path.join(".")),
              },
              { status: 400 },
            );
          }
          const input = parsed.data;
          const ip = mod.clientIp(request);
          await mod.enforceRateLimit(`esc:ip:${ip}`, 10, 300);
          const ctx = await mod.sessionContext(input.session, mod.verifiedOrigin(request));
          await mod.enforceRateLimit(`esc:s:${ctx.claims.sid}`, 5, 300);
          const website = ctx.website;
          // The browser's flag is only a hint; the organization's own clock decides.
          const afterHours = !(await mod.isOrganizationOpen(website));
          const conversation = input.conversationId
            ? await mod.conversationForSession(ctx, input.conversationId)
            : await mod.ensureConversation(website, ctx.visitor, null);
          const db = mod.admin();

          // De-duplicate contacts within the organization using two separate
          // parameterized lookups. Values are never interpolated into a filter
          // string, so a visitor cannot smuggle operators into the query.
          const { normalizeEmail, normalizePhone, visitorSuppliedDetails, appendNote } =
            await import("@/lib/contact-normalize");
          const normalizedEmail = normalizeEmail(input.email);
          const normalizedPhone = normalizePhone(input.phone);
          const now = new Date().toISOString();

          let existingId: string | null = null;
          if (normalizedEmail) {
            const { data } = await db
              .from("contacts")
              .select("id")
              .eq("organization_id", website.organization_id)
              .ilike("email", normalizedEmail)
              .limit(1);
            existingId = data?.[0]?.id ?? null;
          }
          if (!existingId && normalizedPhone) {
            const { data } = await db
              .from("contacts")
              .select("id")
              .eq("organization_id", website.organization_id)
              .eq("phone", normalizedPhone)
              .limit(1);
            existingId = data?.[0]?.id ?? null;
          }

          let contactId = existingId ?? undefined;
          if (contactId) {
            // Never let an anonymous visitor rewrite an existing member's
            // identity fields. Only touch the last-contact timestamp and, when
            // consent was granted, the consent fields.
            await db
              .from("contacts")
              .update({
                last_contact_at: now,
                consent_given: true,
                consent_at: now,
              })
              .eq("id", contactId);
          } else {
            const { data: created, error } = await db
              .from("contacts")
              .insert({
                organization_id: website.organization_id,
                website_id: website.id,
                full_name: input.fullName,
                phone: normalizedPhone ?? input.phone,
                email: normalizedEmail ?? input.email,
                county: input.county ?? null,
                health_plan: input.healthPlan ?? null,
                service_interest: input.serviceInterest ?? null,
                preferred_language: input.preferredLanguage ?? "English",
                consent_given: true,
                consent_at: now,
                last_contact_at: now,
                lead_status: "new",
              })
              .select("id")
              .single();
            if (error)
              return Response.json({ error: "Could not save your details." }, { status: 500 });
            contactId = created.id;
          }

          // When the contact already existed, the newly typed details go to
          // staff as an intake note instead of overwriting the record.
          const intakeNotes = existingId
            ? appendNote(
                input.reason ?? null,
                visitorSuppliedDetails({
                  fullName: input.fullName,
                  county: input.county,
                  healthPlan: input.healthPlan,
                  serviceInterest: input.serviceInterest,
                  preferredLanguage: input.preferredLanguage,
                }),
              )
            : (input.reason ?? null);

          // Visitors never pick a team: routing rules decide, then the
          // organization's default department. Staff transfer from the inbox.
          const { resolveDepartment } = await import("@/lib/handoff.server");
          const departmentId = await resolveDepartment({
            organizationId: website.organization_id,
            preferredDepartmentId: null,
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
            // The transcript is visitor-visible, so contact details stay in the
            // contact and intake records rather than in the chat itself.
            `${input.fullName} requested ${input.kind.replace("_", " ")}. Contact details captured.${input.reason ? ` Reason: ${input.reason}` : ""}`,
            "System",
          );
          // The hand-off itself records the "escalation_requested" event, so
          // nothing is written here. A finished chat is reopened first,
          // otherwise the hand-off would be an illegal transition.
          if (["resolved", "closed", "abandoned"].includes(String(conversation.status))) {
            const { transitionConversation } = await import("@/lib/lifecycle.server");
            await transitionConversation({
              conversationId: conversation.id,
              event: "reopen",
              payload: { to_human: true, detail: "visitor escalated a finished chat" },
              db,
            });
          }

          const typeMap: Record<string, string> = {
            referral: "referral",
            enrollment: "enrollment",
            live_agent: "callback",
            contact: "general",
            message: "general",
          };
          const { data: intakeRow } = await db
            .from("intake_requests")
            .insert({
              organization_id: website.organization_id,
              website_id: website.id,
              conversation_id: conversation.id,
              contact_id: contactId,
              department_id: departmentId,
              request_type: typeMap[input.kind] ?? "general",
              priority: input.kind === "live_agent" ? "high" : "normal",
              full_name: input.fullName,
              email: normalizedEmail ?? input.email,
              phone: normalizedPhone ?? input.phone,
              county: input.county ?? null,
              health_plan: input.healthPlan ?? null,
              service_interest: input.serviceInterest ?? null,
              preferred_language: input.preferredLanguage ?? "English",
              source: "widget",
              after_hours: input.after_hours,
              notes: intakeNotes,
            })
            .select("id")
            .single();

          // Confirmation to the visitor: a written reference that we received
          // the request and that a representative will follow up. Best effort —
          // a mail failure must never fail the visitor's submission.
          try {
            const { sendTemplateEmail } = await import("@/lib/email-templates/send-email");
            const contact = await mod.publicContact(website.id);
            const typeLabels: Record<string, string> = {
              referral: "referral request",
              enrollment: "enrollment request",
              live_agent: "request to speak with a representative",
              contact: "contact request",
              message: "message",
            };
            const referenceId = intakeRow?.id
              ? `REQ-${String(intakeRow.id).replace(/-/g, "").slice(0, 8).toUpperCase()}`
              : undefined;
            await sendTemplateEmail("request-received", normalizedEmail ?? input.email, {
              idempotencyKey: intakeRow?.id ? `intake-ack-${intakeRow.id}` : undefined,
              templateData: {
                fullName: input.fullName,
                organizationName: contact.organization || undefined,
                referenceId,
                requestType: typeLabels[input.kind] ?? "request",
                serviceInterest: input.serviceInterest ?? null,
                county: input.county ?? null,
                preferredLanguage: input.preferredLanguage ?? null,
                message: input.reason ?? null,
                afterHours: input.after_hours,
                supportPhone: contact.phone || undefined,
                supportUrl: contact.domain ? `https://${contact.domain}` : undefined,
                logoUrl:
                  "https://chat.mypacifichealth.com/__l5e/assets-v1/a3b250ac-f23a-4271-8d40-1f9118b44656/phg-logo-light.png",
              },
            });
          } catch (mailError) {
            console.warn("[chat/escalate] confirmation email not sent", mailError);
          }

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
              afterHours: input.after_hours,
            });
            assigned = handoff.assigned;
          } else {
            await notifyStaff({
              organizationId: website.organization_id,
              departmentId,
              type: "new_intake",
              severity: "info",
              title: `New ${input.kind.replace("_", " ")} from ${input.fullName}`,
              // No contact details in the alert body — staff open the record.
              body: input.reason ?? "Contact details captured. Open the request to view them.",
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
          return Response.json(
            { error: "Something went wrong. Please try again." },
            { status: 500 },
          );
        }
      },
    },
  },
});
