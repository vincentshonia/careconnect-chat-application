/**
 * Server-only human hand-off workflow.
 *
 * One code path for every route into the human queue — explicit visitor
 * request, AI low-confidence escalation and supervisory transfer — so a
 * conversation never silently changes status without a department, an event
 * record and a staff alert.
 */
import { admin } from "./public-chat.server";
import { assignRoundRobin, departmentRoutingMode, type AssignedAgent } from "./assignment.server";
import { notifyStaff } from "./notifications.server";

/**
 * Work out which department should own a conversation: the caller's explicit
 * choice, then routing rules, then whatever the conversation already had, then
 * the organization's default department.
 */
export async function resolveDepartment(input: {
  organizationId: string;
  preferredDepartmentId?: string | null;
  matchValue?: string | null;
  currentDepartmentId?: string | null;
}): Promise<string | null> {
  const db = admin();

  if (input.preferredDepartmentId) {
    const { data } = await db
      .from("departments")
      .select("id")
      .eq("id", input.preferredDepartmentId)
      .eq("organization_id", input.organizationId)
      .eq("status", "active")
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const { data: rules } = await db
    .from("routing_rules")
    .select("match_value, department_id, priority")
    .eq("organization_id", input.organizationId)
    .eq("status", "active")
    .order("priority");
  const rule =
    (rules ?? []).find((r: any) => input.matchValue && r.match_value === input.matchValue) ??
    (rules ?? []).find((r: any) => r.match_value === "*");
  if (rule?.department_id) return rule.department_id as string;

  if (input.currentDepartmentId) return input.currentDepartmentId;

  const { data: fallback } = await db
    .from("departments")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("status", "active")
    .eq("is_default", true)
    .maybeSingle();
  return fallback?.id ?? null;
}

export type HandoffResult = {
  departmentId: string | null;
  departmentName: string | null;
  assigned: AssignedAgent | null;
  routingMode: "shared_queue" | "round_robin";
};

/**
 * Put a conversation into the human queue and run the full staff workflow:
 * department resolution, status change, event record, optional round-robin
 * assignment and department-wide notification.
 */
export async function handoffToHumans(input: {
  conversationId: string;
  organizationId: string;
  websiteId: string | null;
  departmentId?: string | null;
  matchValue?: string | null;
  currentDepartmentId?: string | null;
  reason: string;
  /** Shown in the alert, e.g. the visitor's name. */
  visitorLabel?: string | null;
  eventType?: string;
  actorId?: string | null;
  /** Force the shared queue even if the department round-robins. */
  forceSharedQueue?: boolean;
  /**
   * Request left outside operating hours: nobody is on shift, so it waits in
   * the shared queue and the alert is informational rather than critical.
   */
  afterHours?: boolean;
}): Promise<HandoffResult> {
  const db = admin();

  // Idempotency: a conversation already in the human queue must not raise a
  // second alert, event or audit row each time the visitor sends a message.
  const { data: existing } = await db
    .from("conversations")
    .select("department_id, status, escalation_requested, assigned_to, first_human_requested_at")
    .eq("id", input.conversationId)
    .maybeSingle();

  if (
    existing?.escalation_requested &&
    !["resolved", "closed", "abandoned"].includes(String(existing.status))
  ) {
    const { data: currentDept } = existing.department_id
      ? await db
          .from("departments")
          .select("id, name")
          .eq("id", existing.department_id)
          .maybeSingle()
      : { data: null as { id: string; name: string } | null };
    let assigned: AssignedAgent | null = null;
    if (existing.assigned_to) {
      const { data: profile } = await db
        .from("profiles")
        .select("id, full_name")
        .eq("id", existing.assigned_to)
        .maybeSingle();
      assigned = {
        userId: existing.assigned_to as string,
        fullName: (profile?.full_name as string) ?? "Assigned agent",
      } as AssignedAgent;
    }
    return {
      departmentId: (existing.department_id as string | null) ?? null,
      departmentName: currentDept?.name ?? null,
      assigned,
      routingMode: await departmentRoutingMode((existing.department_id as string | null) ?? null),
    };
  }

  const departmentId = await resolveDepartment({
    organizationId: input.organizationId,
    preferredDepartmentId: input.departmentId ?? null,
    matchValue: input.matchValue ?? null,
    currentDepartmentId: input.currentDepartmentId ?? null,
  });

  const { data: department } = departmentId
    ? await db.from("departments").select("id, name").eq("id", departmentId).maybeSingle()
    : { data: null as { id: string; name: string } | null };

  // Every status/ownership write goes through the one lifecycle routine, which
  // leaves a chat somebody already owns untouched.
  const { transitionConversation } = await import("./lifecycle.server");
  await transitionConversation({
    conversationId: input.conversationId,
    event: "handoff",
    actorId: input.actorId ?? null,
    db,
    payload: {
      department_id: departmentId,
      detail: input.reason,
      event_type: input.eventType ?? "escalation_requested",
    },
  });

  const routingMode = input.forceSharedQueue || input.afterHours
    ? ("shared_queue" as const)
    : await departmentRoutingMode(departmentId);

  const assigned =
    routingMode === "round_robin"
      ? await assignRoundRobin({
          organizationId: input.organizationId,
          departmentId,
          conversationId: input.conversationId,
        })
      : null;

  if (assigned) {
    await db.from("conversation_events").insert({
      conversation_id: input.conversationId,
      organization_id: input.organizationId,
      event_type: "auto_assigned",
      detail: `Round-robin assigned to ${assigned.fullName}`,
      new_value: assigned.userId,
    });
  }

  const who = input.visitorLabel?.trim() || "A visitor";
  const where = department?.name ? ` — ${department.name}` : "";

  // A chat somebody already owns is not "waiting" for anyone, so the
  // department-wide alert is skipped entirely.
  if (!existing?.assigned_to) {
    await notifyStaff({
      organizationId: input.organizationId,
      departmentId,
      type: "escalation",
      severity: input.afterHours ? "info" : "critical",
      title: assigned
        ? `Chat claimed by ${assigned.fullName}${where}`
        : `New visitor waiting${where}`,
      body: assigned ? input.reason : `${who} requested a live representative. ${input.reason}`,
      link: `/inbox?c=${input.conversationId}`,
      recordType: "conversations",
      recordId: input.conversationId,
    });
  }

  if (assigned) {
    await notifyStaff({
      organizationId: input.organizationId,
      userIds: [assigned.userId],
      type: "escalation",
      severity: "critical",
      title: `New chat assigned to you${where}`,
      body: input.reason,
      link: `/inbox?c=${input.conversationId}`,
      recordType: "conversations",
      recordId: input.conversationId,
    });
  }

  await db.from("audit_logs").insert({
    organization_id: input.organizationId,
    website_id: input.websiteId,
    actor_id: input.actorId ?? null,
    action: "conversation.handoff",
    record_type: "conversations",
    record_id: input.conversationId,
    new_value: {
      department_id: departmentId,
      routing_mode: routingMode,
      assigned_to: assigned?.userId ?? null,
      reason: input.reason,
    } as never,
  });

  return {
    departmentId,
    departmentName: department?.name ?? null,
    assigned,
    routingMode,
  };
}
