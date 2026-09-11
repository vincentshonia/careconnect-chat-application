/**
 * Single entry point for conversation lifecycle changes.
 *
 * Status, ownership and the timing columns that reporting depends on are only
 * ever written by the `transition_conversation` database routine, which locks
 * the row, refuses illegal moves and records the history entry in the same
 * transaction. Nothing in the application writes those columns directly — a
 * database trigger rejects it.
 */
import { admin } from "./public-chat.server";

export type LifecycleEvent =
  | "handoff"
  | "claim"
  | "reply"
  | "transfer"
  | "reassign"
  | "release"
  | "resolve"
  | "close"
  | "reopen"
  | "abandon";

export type LifecycleResult = {
  ok: boolean;
  changed: boolean;
  status: string | null;
  assigned_to: string | null;
  previous_status: string | null;
  previous_assignee: string | null;
  organization_id: string | null;
  website_id: string | null;
  department_id: string | null;
  reference: string | null;
  first_agent_reply: boolean;
};

/** Thrown when the requested move is not legal for the conversation's state. */
export class LifecycleError extends Error {}

export async function transitionConversation(input: {
  conversationId: string;
  event: LifecycleEvent;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  /** Reuse an existing service-role client instead of opening another. */
  db?: ReturnType<typeof admin>;
}): Promise<LifecycleResult> {
  const db = input.db ?? admin();
  const { data, error } = await db.rpc(
    "transition_conversation" as never,
    {
      _id: input.conversationId,
      _event: input.event,
      _actor: input.actorId ?? null,
      _payload: (input.payload ?? {}) as never,
    } as never,
  );

  if (error) {
    const message = String((error as { message?: string }).message ?? "").trim();
    console.error("[lifecycle] transition failed", input.event, message);
    throw new LifecycleError(
      message || "That conversation could not be updated. Please reload and try again.",
    );
  }

  return data as unknown as LifecycleResult;
}
