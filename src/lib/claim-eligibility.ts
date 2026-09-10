/**
 * Why an agent cannot claim the conversation in front of them.
 *
 * The server enforces these rules anyway; saying the reason up front is what
 * stops an agent clicking Claim three times and getting the same red toast.
 */

export type ClaimContext = {
  /** profiles.presence for the signed-in agent */
  presence: string | null;
  /** conversations currently assigned to them and still open */
  activeChats: number;
  /** profiles.max_concurrent_chats */
  maxChats: number | null;
  /** the conversation's department, if any */
  departmentId: string | null;
  /** departments the agent belongs to */
  myDepartmentIds: string[];
  /** supervisors may pick up work outside their own departments */
  isSupervisor: boolean;
};

/** A short sentence to show in the tooltip, or null when Claim is allowed. */
export function claimBlockReason(ctx: ClaimContext): string | null {
  if (ctx.presence && ctx.presence !== "available") {
    return `You're marked ${ctx.presence} — switch to Available to take chats.`;
  }
  if (ctx.maxChats !== null && ctx.maxChats > 0 && ctx.activeChats >= ctx.maxChats) {
    return `You're at your limit of ${ctx.maxChats} chats — finish one first.`;
  }
  if (
    !ctx.isSupervisor &&
    ctx.departmentId &&
    ctx.myDepartmentIds.length > 0 &&
    !ctx.myDepartmentIds.includes(ctx.departmentId)
  ) {
    return "This chat belongs to a department you're not a member of.";
  }
  return null;
}
