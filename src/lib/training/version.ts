/**
 * Training Center release identity.
 *
 * Every guide states which build of CareConnect it was written against, so a
 * reader can tell at a glance whether the material still matches the console
 * in front of them. Bump `TRAINING_GUIDE_VERSION` and `TRAINING_REVIEWED_ON`
 * whenever guide content is rewritten to match a product change.
 */

/** Semantic version of the training material itself. */
export const TRAINING_GUIDE_VERSION = "1.0.0";

/** ISO date the material was last verified against the running application. */
export const TRAINING_REVIEWED_ON = "2026-09-02";

/** Application build the material was verified against. */
export const TRAINING_APP_BUILD = "167d2c9";

/**
 * Short human sentence used in guide headers and printed handouts.
 */
export function trainingVersionLine() {
  return `Version ${TRAINING_GUIDE_VERSION} · verified ${TRAINING_REVIEWED_ON} against build ${TRAINING_APP_BUILD}`;
}
