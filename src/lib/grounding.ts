/**
 * Grounding checks. Pure helpers so they can be unit tested without a model.
 *
 * The model is told to answer only from the approved sources, but "told to" is
 * not "did". Anything a visitor could act on — a phone number, a link, a dollar
 * amount, a percentage — must appear word-for-word in the sources the model
 * said it used, or it does not reach the visitor.
 */

/** Confidence an answer is forced down to once an unsupported fact is removed. */
export const UNGROUNDED_CONFIDENCE = 0.4;

const PATTERNS: Array<{ kind: FactKind; re: RegExp }> = [
  { kind: "url", re: /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi },
  { kind: "phone", re: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { kind: "money", re: /\$\s?\d[\d,]*(?:\.\d+)?/g },
  { kind: "percent", re: /\b\d+(?:\.\d+)?\s?%/g },
];

export type FactKind = "phone" | "url" | "money" | "percent";
export type Fact = { kind: FactKind; text: string };

/** Digits/letters only, so "(800) 555-0100" and "800-555-0100" compare equal. */
function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractFacts(text: string): Fact[] {
  const seen = new Set<string>();
  const facts: Fact[] = [];
  for (const { kind, re } of PATTERNS) {
    for (const match of (text ?? "").matchAll(re)) {
      const value = match[0].replace(/[.,;:]+$/, "");
      const key = `${kind}:${normalize(value)}`;
      if (!value || seen.has(key)) continue;
      seen.add(key);
      facts.push({ kind, text: value });
    }
  }
  return facts;
}

export type GroundingResult = {
  answer: string;
  confidence: number;
  grounded: boolean;
  /** Facts removed because no cited source contained them. */
  removed: Fact[];
  /** Facts that were checked and found in a cited source. */
  supported: Fact[];
  reason: "ok" | "no_sources" | "unsupported_facts";
};

/**
 * Verify an answer against the text of the chunks the model cited.
 *
 * - No cited source at all -> low confidence, nothing to stand on.
 * - A fact missing from every cited source -> the sentence-level mention is
 *   stripped out and confidence drops to 0.4, which puts the reply behind the
 *   existing hedge and offers a person.
 */
export function checkGrounding(
  answer: string,
  citedTexts: string[],
  confidence: number,
): GroundingResult {
  const body = (answer ?? "").trim();
  const haystack = normalize(citedTexts.join(" \n "));

  if (!citedTexts.length) {
    return {
      answer: body,
      confidence: Math.min(confidence, 0.2),
      grounded: false,
      removed: [],
      supported: [],
      reason: "no_sources",
    };
  }

  const supported: Fact[] = [];
  const removed: Fact[] = [];
  for (const fact of extractFacts(body)) {
    if (haystack.includes(normalize(fact.text))) supported.push(fact);
    else removed.push(fact);
  }

  if (!removed.length) {
    return { answer: body, confidence, grounded: true, removed, supported, reason: "ok" };
  }

  return {
    answer: stripFacts(body, removed),
    confidence: Math.min(confidence, UNGROUNDED_CONFIDENCE),
    grounded: false,
    removed,
    supported,
    reason: "unsupported_facts",
  };
}

/**
 * Remove the unsupported values from the answer. Sentences that carried one are
 * dropped whole — half a sentence reads worse than none — unless that would
 * empty the answer, in which case only the value itself is replaced.
 */
export function stripFacts(answer: string, facts: Fact[]): string {
  const values = facts.map((f) => f.text);
  const sentences = answer.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !values.some((v) => s.includes(v)));
  const rejoined = kept.join(" ").trim();
  if (rejoined) return rejoined;
  let fallback = answer;
  for (const value of values) fallback = fallback.split(value).join("[removed]");
  return fallback.trim();
}
