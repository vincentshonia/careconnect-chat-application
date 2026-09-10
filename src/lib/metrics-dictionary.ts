/**
 * Single source of truth for how each reported number is calculated.
 *
 * Every string here is derived from the reporting SQL (report_overview,
 * report_sla, report_staff, report_ai, dashboard_metrics) so the dashboard
 * tooltips and the Reports "Definitions" panel can never drift apart.
 *
 * Vocabulary used below:
 *  - "human request time" = the first of: human requested, agent requested,
 *    or, when neither exists, the time the conversation started.
 *  - "finished" = the resolved time, or the closed time when there is no
 *    resolved time.
 */

export type MetricDefinition = {
  /** Stable key, also used as the anchor id in the Definitions panel. */
  id: string;
  /** Label shown to staff. */
  term: string;
  /** Plain-language description of the calculation. */
  text: string;
};

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: "first-response",
    term: "First response time",
    text: "Minutes between the human request time and the first staff reply on the conversation. Conversations that never got a staff reply are left out of the average.",
  },
  {
    id: "claim-time",
    term: "Claim time",
    text: "Minutes between the human request time and the moment a staff member claimed the conversation.",
  },
  {
    id: "handle-time",
    term: "Handle time",
    text: "Minutes between the claim and the moment the conversation was finished (resolved, or closed when it was never resolved).",
  },
  {
    id: "resolution-time",
    term: "Resolution time",
    text: "Minutes between the conversation starting and the moment it was finished (resolved, or closed when it was never resolved).",
  },
  {
    id: "sla",
    term: "SLA met / breached",
    text: "Only conversations where a person was requested count towards the target. One counts as met when the first staff reply arrived within the target set in organization settings; anything answered later, or never answered, counts as a breach. The percentage is met divided by the requested conversations.",
  },
  {
    id: "sla-risk",
    term: "SLA risk",
    text: "A live count, not a percentage: open conversations where a person was requested, no staff reply has been sent yet, and the wait has already passed 80% of the target set in organization settings.",
  },
  {
    id: "csat",
    term: "Satisfaction (CSAT)",
    text: "The average of visitor ratings from 1 to 5 left on the conversations in the current filters, shown alongside how many ratings were received.",
  },
  {
    id: "ai-containment",
    term: "AI containment",
    text: "Conversations the assistant answered, that no person touched in any way (no request for a person, no claim, no assignment, no staff message, no transfer) and that ended resolved or closed. Spam and archived conversations are excluded from the comparison.",
  },
  {
    id: "abandoned",
    term: "Abandoned",
    text: "Conversations where a person was requested, no staff reply was ever sent, and the conversation ended closed or abandoned.",
  },
  {
    id: "transfers",
    term: "Transfers",
    text: "A count of transfer events recorded on the conversations in the current filters, so a conversation moved twice counts twice.",
  },
  {
    id: "handled",
    term: "Conversations handled",
    text: "Conversations a staff member actually worked in the period: claimed, replied to, resolved, or closed by them.",
  },
  {
    id: "completion",
    term: "Completion rate",
    text: "Completed conversations divided by the conversations handled in the period.",
  },
  {
    id: "capacity",
    term: "Capacity",
    text: "Your current active chats against the maximum your administrator configured on your profile.",
  },
];

const byId = new Map(METRIC_DEFINITIONS.map((d) => [d.id, d]));

export function metricText(id: string): string {
  return byId.get(id)?.text ?? "";
}

/** Tooltip strings used by the dashboard, kept identical to the definitions. */
export const TIP = {
  firstResponse: metricText("first-response"),
  claim: metricText("claim-time"),
  sla: metricText("sla"),
  slaRisk: metricText("sla-risk"),
  handled: metricText("handled"),
  completion: metricText("completion"),
  handle: metricText("handle-time"),
  capacity: metricText("capacity"),
} as const;
