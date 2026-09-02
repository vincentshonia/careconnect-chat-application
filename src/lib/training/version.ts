/**
 * Training Center release identity.
 *
 * Every guide states which build of CareConnect it was written against and the
 * date it was last checked, so a reader can tell at a glance whether the
 * material still matches the console in front of them. Bump these three
 * constants whenever guide content is rewritten to match a product change.
 */

/** Semantic version of the training material itself. */
export const TRAINING_GUIDE_VERSION = "1.1.0";

/** ISO date the material was last verified against the running application. */
export const TRAINING_REVIEWED_ON = "2026-09-02";

/** Application build the material was verified against. */
export const TRAINING_APP_BUILD = "2927660";

/** "2026-09-02" -> "2 September 2026" without depending on a locale. */
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatReviewDate(iso: string = TRAINING_REVIEWED_ON): string {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  if (!year || !month || !day) return iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** Short human sentence used in guide headers and printed handouts. */
export function trainingVersionLine(): string {
  return `Guide version ${TRAINING_GUIDE_VERSION} · Last reviewed ${formatReviewDate()} · App build ${TRAINING_APP_BUILD}`;
}
