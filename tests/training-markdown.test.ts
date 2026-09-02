/**
 * The written staff manuals are generated from the same typed guides the
 * Training Center renders. These tests prove the renderer keeps every guide
 * complete, safe to hand out, and free of retired sign-in options.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUIDES, GUIDE_ORDER } from "../src/lib/training/registry";
import { guideToMarkdown } from "../src/lib/training/markdown";

describe("staff manual markdown", () => {
  it.each(GUIDE_ORDER)("%s manual renders every chapter and section heading", (role) => {
    const md = guideToMarkdown(GUIDES[role]);
    for (const chapter of GUIDES[role].chapters) {
      expect(md).toContain(chapter.title);
      for (const section of chapter.sections) expect(md).toContain(section.title);
    }
  });

  it.each(GUIDE_ORDER)("%s manual states its version and review date", (role) => {
    const md = guideToMarkdown(GUIDES[role]);
    expect(md).toContain("Last reviewed 2 September 2026");
    expect(md).toMatch(/Guide version \d+\.\d+\.\d+/);
  });

  it.each(GUIDE_ORDER)("%s manual never mentions a retired sign-in provider", (role) => {
    expect(guideToMarkdown(GUIDES[role]).toLowerCase()).not.toContain("microsoft");
  });

  it.each(GUIDE_ORDER)("%s manual labels figures as illustrations", (role) => {
    const md = guideToMarkdown(GUIDES[role]);
    expect(md).toContain("Interface illustration");
    // No figure caption is ever presented as a photograph of the console.
    expect(md).not.toMatch(/Interface illustration[^\n]*screenshot/i);
  });


  it.each(GUIDE_ORDER)("%s manual on disk matches the current guide content", (role) => {
    const file = `docs/staff-manuals/${role.replace(/_/g, "-")}.md`;
    expect(readFileSync(file, "utf8")).toBe(guideToMarkdown(GUIDES[role]));
  });
});
