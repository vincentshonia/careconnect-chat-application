/**
 * Transfer/reassignment eligibility decision.
 *
 * Kept pure and free of server-only imports so the exact rule the server
 * enforces can also be exercised directly by the test suite. The candidate row
 * fed in here must always be re-read from `reassignment_candidates` at the
 * moment of the transfer — never carried over from what the browser rendered.
 */

export type TransferTarget = {
  user_id: string;
  full_name: string;
  eligible: boolean;
  reason: string | null;
};

/** Reasons that describe authority/tenancy, which no override may bypass. */
export const NON_OVERRIDABLE_REASONS = ["Not in this department", "Account is not active"] as const;

export type TransferDecision =
  | { allowed: true; overrideUsed: boolean; overrideReason: string | null }
  | { allowed: false; error: string };

export function decideTransfer(input: {
  /** Freshly resolved candidate row, or undefined when the target is not a candidate at all. */
  target: TransferTarget | undefined;
  override?: boolean;
  overrideReason?: string | undefined;
  /** Whether the acting supervisor holds `staff.edit` (administrator and above). */
  actorCanOverride: boolean;
}): TransferDecision {
  const { target, override, actorCanOverride } = input;

  if (!target) {
    return {
      allowed: false,
      error:
        "That teammate cannot receive this conversation — they are not an active member of this organization with a role that takes chats",
    };
  }

  if (target.eligible) {
    return { allowed: true, overrideUsed: false, overrideReason: null };
  }

  // Availability and capacity may be overridden, but only explicitly, by an
  // administrator, and never silently.
  if (!override) {
    return {
      allowed: false,
      error: `${target.full_name} is not available for this transfer (${target.reason ?? "not eligible"})`,
    };
  }
  if (!actorCanOverride) {
    return { allowed: false, error: "Only administrators can override transfer eligibility" };
  }
  if (NON_OVERRIDABLE_REASONS.includes(target.reason as (typeof NON_OVERRIDABLE_REASONS)[number])) {
    return {
      allowed: false,
      error: `${target.full_name} cannot receive this conversation: ${target.reason!.toLowerCase()}`,
    };
  }

  return {
    allowed: true,
    overrideUsed: true,
    overrideReason: input.overrideReason?.trim() || target.reason || "eligibility override",
  };
}
