/**
 * Normalization helpers for visitor-supplied contact details.
 *
 * These values are used both to look up an existing contact and to store a new
 * one, so lookup and storage must agree on a single canonical form. They are
 * also passed to PostgREST as bound filter values — never interpolated into a
 * filter string — so a visitor cannot smuggle operators into a query.
 */

/** Lowercase, trimmed email. Returns null when there is nothing to compare. */
export function normalizeEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim().toLowerCase();
  return email.length > 0 ? email : null;
}

/**
 * Digits only, so "(555) 010-1234" and "555-010-1234" are the same contact.
 * A leading "+" is dropped along with every other separator. Fewer than 7
 * digits is not a usable phone number and yields null rather than a loose
 * value that could match unrelated rows.
 */
export function normalizePhone(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits.length >= 7 ? digits : null;
}

/**
 * A staff-readable note describing what the visitor typed this time, appended
 * to the intake request rather than written over the existing contact record.
 */
export function visitorSuppliedDetails(input: {
  fullName?: string | null;
  county?: string | null;
  healthPlan?: string | null;
  serviceInterest?: string | null;
  preferredLanguage?: string | null;
}): string {
  const parts = [
    input.fullName ? `Name: ${input.fullName}` : null,
    input.county ? `County: ${input.county}` : null,
    input.healthPlan ? `Health plan: ${input.healthPlan}` : null,
    input.serviceInterest ? `Service interest: ${input.serviceInterest}` : null,
    input.preferredLanguage ? `Preferred language: ${input.preferredLanguage}` : null,
  ].filter(Boolean);
  return `Visitor-supplied details for staff review (existing contact was not modified): ${
    parts.length > 0 ? parts.join(" · ") : "none provided"
  }`;
}

/** Joins an optional reason with the visitor-supplied details block. */
export function appendNote(existing: string | null | undefined, addition: string): string {
  const base = (existing ?? "").trim();
  return base.length > 0 ? `${base}\n\n${addition}` : addition;
}
