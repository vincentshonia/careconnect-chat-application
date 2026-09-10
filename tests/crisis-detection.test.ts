import { describe, expect, it } from "vitest";
import {
  applyConfidenceBand,
  detectCrisis,
  HEDGE_PREFIX,
  LOW_CONFIDENCE_REPLY,
} from "@/lib/ai-confidence";

describe("detectCrisis", () => {
  const positives = [
    "I'm going to kill myself tonight",
    "I am about to hurt someone",
    "I think I'm having a heart attack",
    "I have a stroke happening right now",
    "I can't breathe",
    "I cannot breathe properly",
    "thinking about suicide",
    "I want to end my life",
  ];
  for (const text of positives) {
    it(`flags: ${text}`, () => {
      expect(detectCrisis(text)).toBe(true);
    });
  }

  const negatives = [
    "what is your emergency line",
    "is the after-hours line for emergencies",
    "I had chest pain last year and want to ask about coverage",
    "does the plan cover bleeding disorders",
    "who do I call in an emergency",
    "my father was unconscious after surgery, is rehab covered",
  ];
  for (const text of negatives) {
    it(`does not flag: ${text}`, () => {
      expect(detectCrisis(text)).toBe(false);
    });
  }
});

describe("applyConfidenceBand", () => {
  it("returns the model answer untouched when confident", () => {
    const band = applyConfidenceBand("Open enrollment ends in December.", 0.8);
    expect(band).toMatchObject({ escalate: false, useSources: true, hedged: false });
    expect(band.answer).toBe("Open enrollment ends in December.");
  });

  it("hedges the model answer between 0.3 and 0.5", () => {
    const band = applyConfidenceBand("Open enrollment ends in December.", 0.4);
    expect(band.hedged).toBe(true);
    expect(band.escalate).toBe(true);
    expect(band.useSources).toBe(true);
    expect(band.answer).toBe(`${HEDGE_PREFIX}open enrollment ends in December.`);
  });

  it("uses the canned reply below 0.3", () => {
    const band = applyConfidenceBand("Something vague.", 0.1);
    expect(band.answer).toBe(LOW_CONFIDENCE_REPLY);
    expect(band.useSources).toBe(false);
    expect(band.escalate).toBe(true);
  });

  it("uses the canned reply when the model returned nothing", () => {
    expect(applyConfidenceBand("   ", 0.9).answer).toBe(LOW_CONFIDENCE_REPLY);
  });
});
