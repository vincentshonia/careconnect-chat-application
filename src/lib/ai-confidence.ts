/**
 * Pure helpers for how the assistant handles uncertainty and crisis language.
 * No server imports here so the rules can be unit tested directly.
 */

/**
 * First-person statements of harm or a medical emergency only. Deliberately
 * narrow: bare keywords like "emergency" match ordinary questions such as
 * "what is your emergency line".
 */
export const CRISIS_PATTERNS = [
  /\bI('m| am) (going to|about to) (hurt|kill)/i,
  /\b(suicid|kill myself|end my life)/i,
  /\b(having|I have) (a )?(heart attack|stroke|overdos)/i,
  /\b(can'?t|cannot) breathe\b/i,
];

export function detectCrisis(text: string) {
  return CRISIS_PATTERNS.some((r) => r.test(text));
}

export const LOW_CONFIDENCE_REPLY =
  "I'm not completely confident that I have the correct information for that question. Would you like me to connect you with a representative?";

/** Prefix used when the model is unsure but still has something useful to say. */
export const HEDGE_PREFIX = "I may not have complete information on this, but ";

export type ConfidenceBand = {
  answer: string;
  escalate: boolean;
  useSources: boolean;
  hedged: boolean;
};

/**
 * Decide what the visitor sees for a given confidence score.
 *
 * - 0.5 and above: the model's answer, with its sources.
 * - 0.3 to 0.5: the model's answer behind a short hedge, sources kept.
 * - below 0.3 (or an empty answer): the canned reply with no sources.
 */
export function applyConfidenceBand(modelAnswer: string, confidence: number): ConfidenceBand {
  const body = (modelAnswer ?? "").trim();
  if (confidence >= 0.5 && body) {
    return { answer: body, escalate: false, useSources: true, hedged: false };
  }
  if (confidence >= 0.3 && body) {
    return {
      answer: HEDGE_PREFIX + body.charAt(0).toLowerCase() + body.slice(1),
      escalate: true,
      useSources: true,
      hedged: true,
    };
  }
  return { answer: LOW_CONFIDENCE_REPLY, escalate: true, useSources: false, hedged: false };
}
