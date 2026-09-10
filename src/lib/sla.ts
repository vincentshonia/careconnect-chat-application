/** The fallback first-response target when an organization has not set one. */
export const DEFAULT_SLA_MINUTES = 15;

/**
 * How long a visitor has been waiting for a first human reply.
 *
 * Measured from the moment a person was actually asked for — never from when
 * the chat started, because an AI conversation that runs for an hour before
 * anyone asks for help has not kept a person waiting for an hour.
 */
export function waitingMinutes(
  row: { first_human_requested_at?: string | null; requested_agent_at?: string | null },
  now: number = Date.now(),
): number | null {
  const since = row.first_human_requested_at ?? row.requested_agent_at ?? null;
  if (!since) return null;
  const started = new Date(since).getTime();
  if (Number.isNaN(started)) return null;
  return Math.max(0, (now - started) / 60000);
}

/** True when the wait has passed the organization's target. */
export function isBreached(
  row: { first_human_requested_at?: string | null; requested_agent_at?: string | null },
  targetMinutes: number,
  now: number = Date.now(),
): boolean {
  const minutes = waitingMinutes(row, now);
  return minutes !== null && minutes >= targetMinutes;
}
