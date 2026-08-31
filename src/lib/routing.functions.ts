import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const transferInput = z.object({
  conversationId: z.string().uuid(),
  departmentId: z.string().uuid(),
  note: z.string().trim().max(500).optional().nullable(),
});

/**
 * Move a live conversation to another department: unassign it, alert that
 * team, and round-robin it to their next available member.
 */
export const transferConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => transferInput.parse(input))
  .handler(async ({ data, context }) => {
    // Transfer is a supervisory action — Standard Users may not perform it.
    const { resolveActor, requirePermission } = await import("@/lib/authz.server");
    const actorContext = await resolveActor(context.supabase, context.userId);
    requirePermission(
      actorContext,
      "conversation.transfer",
      "Only team leads and above can transfer conversations",
    );

    // RLS-scoped reads confirm the caller may touch this conversation/department.
    const { data: conversation, error } = await context.supabase
      .from("conversations")
      .select("id, organization_id, website_id, department_id, assigned_to")
      .eq("id", data.conversationId)
      .maybeSingle();
    if (error || !conversation) throw new Error("Conversation not found");

    const { data: department } = await context.supabase
      .from("departments")
      .select("id, name")
      .eq("id", data.departmentId)
      .maybeSingle();
    if (!department) throw new Error("Department not found");

    const { data: actor } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const actorName = actor?.full_name ?? "An agent";

    const { admin } = await import("@/lib/public-chat.server");
    const { assignRoundRobin } = await import("@/lib/assignment.server");
    const { notifyStaff } = await import("@/lib/notifications.server");
    const db = admin();

    await db
      .from("conversations")
      .update({
        department_id: department.id,
        assigned_to: null,
        status: "waiting",
        escalation_requested: true,
      })
      .eq("id", conversation.id);

    await db.from("messages").insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      website_id: conversation.website_id,
      sender_type: "system",
      sender_name: "System",
      body: `${actorName} transferred this conversation to ${department.name}${data.note ? ` — ${data.note}` : ""}`,
    });

    await db.from("conversation_events").insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      actor_id: context.userId,
      event_type: "transferred",
      detail: data.note ?? `Transferred to ${department.name}`,
      previous_value: conversation.department_id,
      new_value: department.id,
    });

    // Only auto-assign when the destination department round-robins; a shared
    // queue leaves the chat waiting for the first eligible agent to claim.
    const { departmentRoutingMode } = await import("@/lib/assignment.server");
    const mode = await departmentRoutingMode(department.id);
    const assigned =
      mode === "round_robin"
        ? await assignRoundRobin({
            organizationId: conversation.organization_id,
            departmentId: department.id,
            conversationId: conversation.id,
          })
        : null;

    await notifyStaff({
      organizationId: conversation.organization_id,
      departmentId: department.id,
      type: "escalation",
      severity: "critical",
      title: assigned
        ? `Chat transferred to ${department.name} — assigned to ${assigned.fullName}`
        : `Chat transferred to ${department.name} — waiting for an agent`,
      body: data.note ?? `Transferred by ${actorName}`,
      link: "/inbox",
      recordType: "conversations",
      recordId: conversation.id,
    });

    if (assigned) {
      await notifyStaff({
        organizationId: conversation.organization_id,
        userIds: [assigned.userId],
        type: "escalation",
        severity: "critical",
        title: `Chat assigned to you by ${actorName}`,
        body: data.note ?? `Transferred to ${department.name}`,
        link: "/inbox",
        recordType: "conversations",
        recordId: conversation.id,
      });
    }

    await db.from("audit_logs").insert({
      organization_id: conversation.organization_id,
      website_id: conversation.website_id,
      actor_id: context.userId,
      actor_name: actorName,
      action: "conversation.transferred",
      record_type: "conversations",
      record_id: conversation.id,
      previous_value: { department_id: conversation.department_id },
      new_value: { department_id: department.id, assigned_to: assigned?.userId ?? null },
    });

    return { departmentName: department.name, assignedTo: assigned?.fullName ?? null };
  });
