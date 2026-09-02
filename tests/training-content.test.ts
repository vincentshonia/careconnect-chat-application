/**
 * Guardrails for the Training Center content.
 *
 * The guides are only trustworthy if they describe the console that exists and
 * are filtered by the same permission strings the application enforces. These
 * tests fail loudly if content drifts away from either.
 */
import { describe, expect, it } from "vitest";
import {
  PLATFORM_ROLE_PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsFor,
  type OrgRole,
} from "../src/lib/permissions";
import { GUIDES, GUIDE_ORDER } from "../src/lib/training/registry";
import { FIGURE_IDS, type Block, type Guide } from "../src/lib/training/types";
import {
  availableGuideRoles,
  defaultGuideRole,
  sectionIds,
  visibleGuide,
} from "../src/lib/training/select";

const KNOWN_PERMISSIONS = new Set<string>([
  ...Object.values(ROLE_PERMISSIONS).flat(),
  ...Object.values(PLATFORM_ROLE_PERMISSIONS).flat(),
]);

const FIGURES = new Set<string>(FIGURE_IDS);

function blocks(guide: Guide): Block[] {
  return guide.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.blocks));
}

function gates(guide: Guide) {
  return [
    ...guide.chapters.map((chapter) => chapter.gate),
    ...guide.chapters.flatMap((chapter) => chapter.sections.map((section) => section.gate)),
  ].filter(Boolean);
}

describe("training guides are structurally sound", () => {
  it("defines a guide for every role in the picker", () => {
    for (const role of GUIDE_ORDER) {
      expect(GUIDES[role]).toBeTruthy();
      expect(GUIDES[role].chapters.length).toBeGreaterThan(3);
    }
  });

  it.each(GUIDE_ORDER)("%s guide has unique section ids", (role) => {
    const ids = sectionIds(GUIDES[role]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(GUIDE_ORDER)("%s guide only references figures that exist", (role) => {
    for (const block of blocks(GUIDES[role])) {
      if (block.kind === "figure") expect(FIGURES.has(block.figure)).toBe(true);
    }
  });

  it.each(GUIDE_ORDER)("%s guide only gates on real permissions", (role) => {
    for (const gate of gates(GUIDES[role])) {
      for (const permission of [...(gate?.anyOf ?? []), ...(gate?.allOf ?? [])]) {
        expect(KNOWN_PERMISSIONS.has(permission)).toBe(true);
      }
    }
  });

  it.each(GUIDE_ORDER)("%s guide has answerable knowledge-check questions", (role) => {
    const quizzes = blocks(GUIDES[role]).filter((block) => block.kind === "quiz");
    expect(quizzes.length).toBeGreaterThan(0);
    for (const quiz of quizzes) {
      if (quiz.kind !== "quiz") continue;
      expect(quiz.items.length).toBeGreaterThanOrEqual(5);
      for (const item of quiz.items) {
        expect(item.options.length).toBeGreaterThanOrEqual(2);
        expect(item.answer).toBeGreaterThanOrEqual(0);
        expect(item.answer).toBeLessThan(item.options.length);
        expect(item.why.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("guides never teach a screen the reader cannot open", () => {
  const cases: OrgRole[] = ["agent", "team_lead", "manager", "administrator", "super_admin"];

  it.each(cases)("%s sees only sections their permissions unlock", (role) => {
    const permissions = permissionsFor(role, null);
    const visible = visibleGuide(GUIDES[role], permissions);
    for (const chapter of visible.chapters) {
      expect(chapter.sections.length).toBeGreaterThan(0);
      for (const section of chapter.sections) {
        for (const gate of [chapter.gate, section.gate]) {
          for (const permission of gate?.anyOf ?? []) {
            // anyOf only needs one hit; assert at least one is held.
          }
          if (gate?.anyOf) {
            expect(gate.anyOf.some((permission) => permissions.has(permission))).toBe(true);
          }
          for (const permission of gate?.allOf ?? []) {
            expect(permissions.has(permission)).toBe(true);
          }
        }
      }
    }
  });

  it("standard users never see administration chapters", () => {
    const visible = visibleGuide(GUIDES.agent, permissionsFor("agent", null));
    const text = JSON.stringify(visible).toLowerCase();
    expect(text).not.toContain("create a staff account");
    expect(text).not.toContain("routing rule");
  });

  it("administrators do see staff administration", () => {
    const visible = visibleGuide(GUIDES.administrator, permissionsFor("administrator", null));
    const ids = sectionIds(visible);
    expect(ids.some((id) => id.startsWith("staff-"))).toBe(true);
  });
});

describe("guide access follows authority", () => {
  it("a standard user may only read the standard user guide", () => {
    const available = availableGuideRoles("agent", null, permissionsFor("agent", null));
    expect(available).toEqual(["agent"]);
  });

  it("a manager may read down but not up", () => {
    const available = availableGuideRoles("manager", null, permissionsFor("manager", null));
    expect(available).toEqual(["agent", "team_lead", "manager"]);
    expect(available).not.toContain("administrator");
  });

  it("the platform guide requires a platform role", () => {
    const tenantOnly = availableGuideRoles(
      "super_admin",
      null,
      permissionsFor("super_admin", null),
    );
    expect(tenantOnly).not.toContain("platform_owner");

    const platform = availableGuideRoles(
      "super_admin",
      "platform_owner",
      permissionsFor("super_admin", "platform_owner"),
    );
    expect(platform).toContain("platform_owner");
  });

  it("opens on the reader's own guide", () => {
    expect(defaultGuideRole("team_lead", null, permissionsFor("team_lead", null))).toBe("team_lead");
    expect(defaultGuideRole(null, null, new Set())).toBe("agent");
  });
});
