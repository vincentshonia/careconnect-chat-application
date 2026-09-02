/**
 * Print / Save-as-PDF support for the Training Center.
 *
 * The browser uses the document title as the default PDF filename, so the
 * title is swapped for something meaningful for the duration of the print and
 * restored afterwards. Kept as a pure helper so it can be tested without a DOM.
 */
import { TRAINING_GUIDE_VERSION, TRAINING_REVIEWED_ON } from "./version";

export type PrintableWindow = {
  print: () => void;
  document: { title: string };
};

/** Filename-friendly heading used for the printed handout. */
export function printableTitle(guideLabel: string): string {
  return `CareConnect ${guideLabel} guide — v${TRAINING_GUIDE_VERSION} — reviewed ${TRAINING_REVIEWED_ON}`;
}

/**
 * Opens the browser print dialog with a meaningful document title, restoring
 * the previous title even when printing throws or is cancelled.
 */
export function printGuide(win: PrintableWindow | null | undefined, guideLabel: string): boolean {
  if (!win || typeof win.print !== "function") return false;
  const previous = win.document.title;
  try {
    win.document.title = printableTitle(guideLabel);
    win.print();
    return true;
  } finally {
    win.document.title = previous;
  }
}
