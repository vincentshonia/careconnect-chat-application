import { describe, expect, it } from "vitest";
import { chunkText, faqDocument, serviceDocument } from "@/lib/knowledge-index.server";

describe("chunkText", () => {
  it("prefixes every chunk with the document title", () => {
    const chunks = chunkText("a".repeat(3000), 1200, 150, "Medicare basics");
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.startsWith("Medicare basics\n\n")).toBe(true);
  });

  it("overlaps consecutive chunks even when paragraphs are short", () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${"x".repeat(180)}`);
    const chunks = chunkText(paragraphs.join("\n\n"), 600, 150, "Guide");
    expect(chunks.length).toBeGreaterThan(1);
    const previousTail = chunks[0].slice(-80);
    expect(chunks[1].includes(previousTail.slice(-40))).toBe(true);
  });

  it("returns nothing for empty text", () => {
    expect(chunkText("   ", 1200, 150, "Title")).toEqual([]);
  });
});

describe("source documents", () => {
  it("formats a FAQ as question and answer", () => {
    expect(faqDocument({ question: "Do you help with Medi-Cal?", answer: "Yes." })).toBe(
      "Q: Do you help with Medi-Cal?\nA: Yes.",
    );
  });

  it("includes coverage details for a service", () => {
    const text = serviceDocument({
      name: "Care coordination",
      short_description: "Help managing appointments.",
      eligibility_overview: "Adults over 18.",
      counties: ["Los Angeles", "Orange"],
      health_plans: ["Medi-Cal"],
      learn_more_url: "https://example.test/care",
    });
    expect(text).toContain("Care coordination");
    expect(text).toContain("Eligibility: Adults over 18.");
    expect(text).toContain("Counties served: Los Angeles, Orange");
    expect(text).toContain("Health plans: Medi-Cal");
    expect(text).toContain("https://example.test/care");
  });

  it("skips missing service fields", () => {
    const text = serviceDocument({ name: "Intake", short_description: "Start here." });
    expect(text).toBe("Intake\nStart here.");
  });
});
