/**
 * Pure helpers for how the assistant handles uncertainty and crisis language.
 * No server imports here so the rules can be unit tested directly.
 */

/** Languages the canned replies and crisis phrases are written for. */
export type ReplyLanguage = "en" | "es";

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

/** Spanish equivalents of the same first-person crisis statements. */
export const CRISIS_PATTERNS_ES = [
  /\b(me\s+voy\s+a|quiero)\s+(matar|hacer\s+da(ñ|n)o|suicidar)/i,
  /\bsuicid(arme|io|arme|ar)\b/i,
  /\bquitarme\s+la\s+vida\b/i,
  /\b(estoy|está|esta)\s+(teniendo|sufriendo)\s+(un\s+)?(infarto|ataque\s+card(í|i)aco|derrame|sobredosis)/i,
  /\bno\s+puedo\s+respirar\b/i,
];

export const ALL_CRISIS_PATTERNS = [...CRISIS_PATTERNS, ...CRISIS_PATTERNS_ES];

export function detectCrisis(text: string) {
  return ALL_CRISIS_PATTERNS.some((r) => r.test(text));
}

export const LOW_CONFIDENCE_REPLY =
  "I'm not completely confident that I have the correct information for that question. Would you like me to connect you with a representative?";

export const LOW_CONFIDENCE_REPLY_ES =
  "No tengo total seguridad de contar con la información correcta para esa pregunta. ¿Desea que lo comunique con un representante?";

/** Prefix used when the model is unsure but still has something useful to say. */
export const HEDGE_PREFIX = "I may not have complete information on this, but ";
export const HEDGE_PREFIX_ES = "Puede que no tenga información completa sobre esto, pero ";

export const CRISIS_FOLLOW_UP =
  "I can also connect you with a representative during business hours.";
export const CRISIS_FOLLOW_UP_ES =
  "También puedo comunicarlo con un representante durante el horario de atención.";

export const EMERGENCY_FALLBACK =
  "If this is a medical emergency, please call 911 immediately.";
export const EMERGENCY_FALLBACK_ES =
  "Si se trata de una emergencia médica, llame al 911 de inmediato.";

/** Map anything the visitor or their contact record says into a supported language. */
export function normalizeLanguage(value?: string | null): ReplyLanguage {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return "en";
  if (raw.startsWith("es") || raw.includes("spanish") || raw.includes("español")) return "es";
  return "en";
}

const ES_HINTS =
  /[¿¡áéíóúñ]|\b(hola|gracias|ayuda|necesito|quiero|puedo|donde|dónde|como|cómo|cuando|cuándo|servicios|seguro|condado|condados|salud|cita|información|por favor|tengo|estoy|usted|ustedes)\b/i;

/**
 * Last-resort guess when nobody told us the visitor's language: does the
 * message itself look Spanish? Deliberately conservative — accents and a small
 * set of very common words only.
 */
export function detectLanguage(text: string): ReplyLanguage {
  return ES_HINTS.test(text ?? "") ? "es" : "en";
}

export function lowConfidenceReply(language: ReplyLanguage = "en") {
  return language === "es" ? LOW_CONFIDENCE_REPLY_ES : LOW_CONFIDENCE_REPLY;
}

export function hedgePrefix(language: ReplyLanguage = "en") {
  return language === "es" ? HEDGE_PREFIX_ES : HEDGE_PREFIX;
}

export function crisisFollowUp(language: ReplyLanguage = "en") {
  return language === "es" ? CRISIS_FOLLOW_UP_ES : CRISIS_FOLLOW_UP;
}

export function emergencyFallback(language: ReplyLanguage = "en") {
  return language === "es" ? EMERGENCY_FALLBACK_ES : EMERGENCY_FALLBACK;
}

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
export function applyConfidenceBand(
  modelAnswer: string,
  confidence: number,
  language: ReplyLanguage = "en",
): ConfidenceBand {
  const body = (modelAnswer ?? "").trim();
  if (confidence >= 0.5 && body) {
    return { answer: body, escalate: false, useSources: true, hedged: false };
  }
  if (confidence >= 0.3 && body) {
    return {
      answer: hedgePrefix(language) + body.charAt(0).toLowerCase() + body.slice(1),
      escalate: true,
      useSources: true,
      hedged: true,
    };
  }
  return {
    answer: lowConfidenceReply(language),
    escalate: true,
    useSources: false,
    hedged: false,
  };
}
