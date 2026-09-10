import { describe, expect, it } from "vitest";
import { checkGrounding, extractFacts, UNGROUNDED_CONFIDENCE } from "@/lib/grounding";
import {
  applyConfidenceBand,
  detectCrisis,
  lowConfidenceReply,
  normalizeLanguage,
} from "@/lib/ai-confidence";

const SOURCE = [
  "Contact us\nCall Pacific Health Group at (800) 555-0100 or visit https://example.test/help. Enrollment costs $0 and covers 100% of eligible visits.",
];

describe("extractFacts", () => {
  it("finds phone numbers, links, amounts and percentages", () => {
    const kinds = extractFacts(
      "Call (800) 555-0100 or see https://example.test/help — it is $25 and covers 80%.",
    ).map((f) => f.kind);
    expect(kinds).toContain("phone");
    expect(kinds).toContain("url");
    expect(kinds).toContain("money");
    expect(kinds).toContain("percent");
  });
});

describe("checkGrounding", () => {
  it("keeps facts that appear in a cited source, even in another format", () => {
    const result = checkGrounding("You can call 800-555-0100 for help.", SOURCE, 0.9);
    expect(result.grounded).toBe(true);
    expect(result.confidence).toBe(0.9);
    expect(result.answer).toContain("800-555-0100");
  });

  it("strips an invented phone number and lowers confidence", () => {
    const result = checkGrounding(
      "We can help with that. Call (888) 222-3333 to enroll today.",
      SOURCE,
      0.95,
    );
    expect(result.grounded).toBe(false);
    expect(result.reason).toBe("unsupported_facts");
    expect(result.confidence).toBe(UNGROUNDED_CONFIDENCE);
    expect(result.answer).not.toContain("888");
    expect(result.answer).toContain("We can help with that.");
  });

  it("strips an unsupported link and dollar amount", () => {
    const result = checkGrounding(
      "Sign up at https://not-real.test/apply. The fee is $49.",
      SOURCE,
      0.8,
    );
    expect(result.removed.map((f) => f.kind).sort()).toEqual(["money", "url"]);
    expect(result.answer).not.toContain("not-real.test");
    expect(result.answer).not.toContain("$49");
  });

  it("treats an answer with no cited sources as low confidence", () => {
    const result = checkGrounding("We serve every county in California.", [], 0.9);
    expect(result.reason).toBe("no_sources");
    expect(result.confidence).toBeLessThanOrEqual(0.2);
  });

  it("never returns an empty answer when every sentence was stripped", () => {
    const result = checkGrounding("Call (888) 222-3333.", SOURCE, 0.9);
    expect(result.answer.length).toBeGreaterThan(0);
    expect(result.answer).not.toContain("888");
  });
});

describe("Spanish support", () => {
  it("detects Spanish crisis phrases", () => {
    expect(detectCrisis("quiero suicidarme")).toBe(true);
    expect(detectCrisis("no puedo respirar")).toBe(true);
    expect(detectCrisis("me voy a hacer daño")).toBe(true);
  });

  it("does not flag ordinary Spanish questions", () => {
    expect(detectCrisis("¿cuál es su número de emergencia?")).toBe(false);
    expect(detectCrisis("necesito ayuda con Medi-Cal")).toBe(false);
  });

  it("maps language hints to a supported reply language", () => {
    expect(normalizeLanguage("es-MX")).toBe("es");
    expect(normalizeLanguage("Spanish")).toBe("es");
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
  });

  it("uses Spanish canned replies and hedge when the visitor speaks Spanish", () => {
    const band = applyConfidenceBand("Podemos ayudarle.", 0.35, "es");
    expect(band.hedged).toBe(true);
    expect(band.answer.startsWith("Puede que no tenga")).toBe(true);
    expect(applyConfidenceBand("", 0.1, "es").answer).toBe(lowConfidenceReply("es"));
  });
});
