/**
 * Conversation ownership and response workflow.
 *
 * Visibility, ownership, response rights and administrative authority are
 * separate concerns. The browser never writes `assigned_to` directly — every
 * claim, reassignment, reply and closure flows through these audited server
 * functions where eligibility is verified against the authoritative membership
 * record.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, ForbiddenError, writeAudit, type Actor } from "@/lib/authz.server";

const idInput = z.object({ conversationId: z.string().uuid() });

type ConversationRow = {
  id: string;
  organization_id: string;
  website_id: string | null;
  department_id: string | null;
  assigned_to: string | null;
  status: string;
  reference: string | null;
};

const CLOSED_STATUSES = ["closed", "resolved", "archived", "spam"];

const CLAIMABLE_STATUSES = ["new", "waiting", "escalated", "follow_up"];

/** Can this actor see the conversation at all? Mirrors the RLS predicate. */
function canView(actor: Actor, conversation: ConversationRow) {
  if (actor.organizationId !== conversation.organization_id && !actor.isPlatformAdmin) return false;
  if (actor.permissions.has("conversation.view_all")) return true;
  if (conversation.assigned_to === actor.userId) return true;
  if (
    actor.permissions.has("conversation.view_department") &&
    conversation.department_id &&
    actor.departmentIds.includes(conversation.department_id)
  ) {
    return true;
  }
  return (
    !conversation.assigned_to &&
    (!conversation.department_id || actor.departmentIds.includes(conversation.department_id))
  );
}

function isSupervisor(actor: Actor) {
  return (
    actor.permissions.has("conversation.reassign") ||
    actor.permissions.has("conversation.view_all")
  );
}

async function loadConversation(id: string): Promise<ConversationRow> {
  const { admin } = await import("@/lib/public-chat.server");
  const { data } = await admin()
    .from("conversations")
    .select("id, organization_id, website_id, department_id, assigned_to, status, reference")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new ForbiddenError("Conversation not found");
  return data as ConversationRow;
}

async function agentName(userId: string) {
  const { admin } = await import("@/lib/public-chat.server");
  const { data } = await admin().from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return (data?.full_name as string) || "A team member";
}

/**
 * Take ownership of a waiting conversation. Race-safe: the update only lands
 * while `assigned_to` is still null, so a simultaneous claim loses cleanly.
 */
export const claimConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    if (!actor.permissions.has("conversation.claim")) {
      throw new ForbiddenError("You are not allowed to claim conversations");
    }

    const conversation = await loadConversation(data.conversationId);
    if (!canView(actor, conversation)) {
      throw new ForbiddenError("This conversation is not in one of your departments");
    }
    if (CLOSED_STATUSES.includes(conversation.status)) {
      throw new ForbiddenError("This conversation is already closed");
    }
    if (conversation.assigned_to) {
      const owner = await agentName(conversation.assigned_to);
      throw new ForbiddenError(`This conversation was just claimed by ${owner}.`);
    }
    if (!CLAIMABLE_STATUSES.includes(conversation.status)) {
      throw new ForbiddenError("This conversation cannot be claimed right now");
    }

    const { admin } = await import("@/lib/public-chat.server");
    const db = admin();

    // Profile eligibility: account must be active.
    const { data: profile } = await db
      .from("profiles")
      .select("full_name, status")
      .eq("id", actor.userId)
      .maybeSingle();
    if (!profile || profile.status !== "active") {
      throw new ForbiddenError("Your account is not active");
    }


    const now = new Date().toISOString();
    const { data: updated } = await db
      .from("conversations")
      .update({ assigned_to: actor.userId, status: "assigned", claimed_at: now })
      .eq("id", conversation.id)
      .is("assigned_to", null)
      .in("status", CLAIMABLE_STATUSES)
      .select("id");

    if (!updated || updated.length === 0) {
      const current = await loadConversation(conversation.id);
      const owner = current.assigned_to ? await agentName(current.assigned_to) : "another team member";
      throw new ForbiddenError(`This conversation was just claimed by ${owner}.`);
    }

    const name = (profile.full_name as string) || actor.fullName || "A team member";

    await db.from("conversation_events").insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      actor_id: actor.userId,
      event_type: "claimed",
      detail: `${name} claimed this conversation`,
      previous_value: null,
      new_value: actor.userId,
    });

    await db.from("messages").insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      website_id: conversation.website_id,
      sender_type: "system",
      sender_name: "System",
      body: `${name} joined the conversation.`,
    });

    const { notifyStaff } = await import("@/lib/notifications.server");
    await notifyStaff({
      organizationId: conversation.organization_id,
      departmentId: conversation.department_id,
      type: "escalation",
      severity: "info",
      title: `Claimed by ${name}`,
      body: conversation.reference ? `Conversation ${conversation.reference}` : null,
      link: "/inbox",
      recordType: "conversations",
      recordId: conversation.id,
    });

    await writeAudit(db as never, {
      actor,
      organizationId: conversation.organization_id,
      action: "conversation.claimed",
      recordType: "conversations",
      recordId: conversation.id,
      previousValue: { assigned_to: null, status: conversation.status },
      newValue: {
        assigned_to: actor.userId,
        assigned_name: name,
        status: "assigned",
        department_id: conversation.department_id,
        claimed_at: now,
      },
    });

    return { ok: true, assignedTo: actor.userId, assignedName: name };
  });

/** Post a visitor-facing reply. Only the owner, or a supervisor, may do this. */
export const replyToConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), body: z.string().trim().min(1).max(4000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const conversation = await loadConversation(data.conversationId);

    if (!canView(actor, conversation)) throw new ForbiddenError("Conversation not found");
    if (CLOSED_STATUSES.includes(conversation.status)) {
      throw new ForbiddenError("This conversation is closed");
    }

    const isOwner = conversation.assigned_to === actor.userId;
    if (!isOwner && !isSupervisor(actor)) {
      const owner = conversation.assigned_to
        ? await agentName(conversation.assigned_to)
        : "another team member";
      throw new ForbiddenError(`${owner} is currently handling this conversation.`);
    }
    if (!isOwner && !conversation.assigned_to) {
      throw new ForbiddenError("Claim this conversation before replying");
    }

    const { admin } = await import("@/lib/public-chat.server");
    const db = admin();
    const name = actor.fullName || (await agentName(actor.userId));
    const now = new Date().toISOString();

    const { error } = await db.from("messages").insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      website_id: conversation.website_id,
      sender_type: "agent",
      sender_user_id: actor.userId,
      sender_name: name,
      body: data.body,
    });
    if (error) throw new Error("Could not send that reply");

    const patch: Record<string, unknown> = {
      status: "active",
      last_message_at: now,
      unread_agent_count: 0,
    };
    const { data: existing } = await db
      .from("conversations")
      .select("first_response_at, first_agent_response_at")
      .eq("id", conversation.id)
      .maybeSingle();
    if (!existing?.first_agent_response_at) patch.first_agent_response_at = now;
    if (!existing?.first_response_at) patch.first_response_at = now;

    await db.from("conversations").update(patch).eq("id", conversation.id);

    await writeAudit(db as never, {
      actor,
      organizationId: conversation.organization_id,
      action: "conversation.agent_replied",
      recordType: "conversations",
      recordId: conversation.id,
      newValue: { sender_user_id: actor.userId, sender_name: name },
    });

    return { ok: true };
  });

/** Reassign ownership. Supervisory action, always audited. */
export const reassignConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        userId: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    if (!isSupervisor(actor)) {
      throw new ForbiddenError("Only team leads and above can reassign conversations");
    }
    const conversation = await loadConversation(data.conversationId);
    if (!canView(actor, conversation)) throw new ForbiddenError("Conversation not found");

    const { admin } = await import("@/lib/public-chat.server");
    const db = admin();

    if (data.userId) {
      const { data: target } = await db
        .from("organization_memberships")
        .select("user_id")
        .eq("user_id", data.userId)
        .eq("organization_id", conversation.organization_id)
        .eq("status", "active")
        .maybeSingle();
      if (!target) throw new ForbiddenError("That teammate is not part of this organization");
    }

    await db
      .from("conversations")
      .update({
        assigned_to: data.userId,
        status: data.userId ? "assigned" : "waiting",
        claimed_at: data.userId ? new Date().toISOString() : null,
      })
      .eq("id", conversation.id);

    const newName = data.userId ? await agentName(data.userId) : null;

    await db.from("conversation_events").insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      actor_id: actor.userId,
      event_type: data.userId ? "reassigned" : "released",
      detail: newName ? `Reassigned to ${newName}` : "Returned to the department queue",
      previous_value: conversation.assigned_to,
      new_value: data.userId,
    });

    const { notifyStaff } = await import("@/lib/notifications.server");
    await notifyStaff({
      organizationId: conversation.organization_id,
      departmentId: conversation.department_id,
      userIds: data.userId ? [data.userId] : undefined,
      type: "escalation",
      severity: data.userId ? "critical" : "warning",
      title: newName ? `Chat assigned to ${newName}` : "Chat returned to the queue",
      body: `By ${actor.fullName ?? "a supervisor"}`,
      link: "/inbox",
      recordType: "conversations",
      recordId: conversation.id,
    });

    await writeAudit(db as never, {
      actor,
      organizationId: conversation.organization_id,
      action: "conversation.reassigned",
      recordType: "conversations",
      recordId: conversation.id,
      previousValue: { assigned_to: conversation.assigned_to },
      newValue: { assigned_to: data.userId },
    });

    return { ok: true, assignedName: newName };
  });

/** Close a conversation. Owner or supervisor only. */
export const closeConversationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const conversation = await loadConversation(data.conversationId);
    if (!canView(actor, conversation)) throw new ForbiddenError("Conversation not found");

    const isOwner = conversation.assigned_to === actor.userId;
    if (!isOwner && !isSupervisor(actor)) {
      throw new ForbiddenError("Only the assigned agent can close this conversation");
    }

    const { admin } = await import("@/lib/public-chat.server");
    const db = admin();
    const now = new Date().toISOString();
    await db
      .from("conversations")
      .update({ status: "closed", closed_at: now, closed_by: actor.userId })
      .eq("id", conversation.id);


    await db.from("conversation_events").insert({
      conversation_id: conversation.id,
      organization_id: conversation.organization_id,
      actor_id: actor.userId,
      event_type: "closed",
      detail: `Closed by ${actor.fullName ?? "an agent"}`,
      previous_value: conversation.status,
      new_value: "closed",
    });

    await writeAudit(db as never, {
      actor,
      organizationId: conversation.organization_id,
      action: "conversation.closed",
      recordType: "conversations",
      recordId: conversation.id,
      previousValue: { status: conversation.status },
      newValue: { status: "closed", closed_at: now },
    });

    return { ok: true };
  });

/**
 * Mint a short-lived signed URL for a visitor attachment so the agent can
 * view or save it. Access mirrors conversation visibility.
 */
export const attachmentUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ conversationId: z.string().uuid(), path: z.string().min(1).max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const conversation = await loadConversation(data.conversationId);
    if (!canView(actor, conversation)) throw new ForbiddenError("Conversation not found");
    // The stored path is namespaced by org + conversation: refuse anything else.
    if (!data.path.startsWith(`${conversation.organization_id}/${conversation.id}/`)) {
      throw new ForbiddenError("That attachment does not belong to this conversation");
    }

    const { admin } = await import("@/lib/public-chat.server");
    const { data: signed, error } = await admin()
      .storage.from("chat-attachments")
      .createSignedUrl(data.path, 60 * 10);
    if (error || !signed?.signedUrl) throw new ForbiddenError("Could not open that attachment");
    return { url: signed.signedUrl };
  });
