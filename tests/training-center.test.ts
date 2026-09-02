/**
 * Behavioural guardrails for the Training Center shell.
 *
 * The content tests in `training-content.test.ts` prove the guides describe the
 * real console. These tests prove the surrounding machinery behaves: who may
 * open which guide, which guide a reader lands on, that one person's progress
 * can never bleed into another's, that the print handout is named correctly,
 * and that no guide ever mentions a sign-in provider the console does not
 * offer.
 */
import { describe, expect, it } from "vitest";
import { permissionsFor, type OrgRole, type PlatformRole } from "../src/lib/permissions";
import { GUIDES, GUIDE_ORDER } from "../src/lib/training/registry";
import {
  availableGuideRoles,
  canReadPlatformAppendix,
  defaultGuideRole,
  flattenSections,
  guideByRole,
  guideText,
  nextUnreadSection,
  sectionIds,
  sectionSearchText,
  visibleGuide,
} from "../src/lib/training/select";
import {
  canFlagGuideReview,
  clearCompletedSections,
  clearReviewFlag,
  completionPercent,
  progressStorageKey,
  readCompletedSections,
  readReviewFlag,
  reviewStorageKey,
  toggleCompletedSection,
  writeCompletedSections,
  writeReviewFlag,
  type StorageLike,
} from "../src/lib/training/progress";
import { printGuide, printableTitle } from "../src/lib/training/print";
import {
  TRAINING_APP_BUILD,
  TRAINING_GUIDE_VERSION,
  TRAINING_REVIEWED_ON,
  formatReviewDate,
  trainingVersionLine,
} from "../src/lib/training/version";
import type { GuideRole } from "../src/lib/training/types";

/** In-memory stand-in for `localStorage`. */
function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const perms = (role: OrgRole | null, platform: PlatformRole | null = null) =>
  permissionsFor(role, platform);

/* -------------------------------------------------------------------------- */
/* Guide access                                                               */
/* -------------------------------------------------------------------------- */

describe("who may open which guide", () => {
  it("a standard user reads only the standard user guide", () => {
    expect(availableGuideRoles("agent", null, perms("agent"))).toEqual(["agent"]);
  });

  it("a team lead reads their own guide and the one below it", () => {
    expect(availableGuideRoles("team_lead", null, perms("team_lead"))).toEqual([
      "agent",
      "team_lead",
    ]);
  });

  it("a manager reads down to standard user but never administration", () => {
    const available = availableGuideRoles("manager", null, perms("manager"));
    expect(available).toEqual(["agent", "team_lead", "manager"]);
    expect(available).not.toContain("administrator");
    expect(available).not.toContain("super_admin");
  });

  it("an administrator reads every organization guide but not the platform appendix", () => {
    const available = availableGuideRoles("administrator", null, perms("administrator"));
    expect(available).toEqual([
      "agent",
      "team_lead",
      "manager",
      "administrator",
      "super_admin",
    ]);
    expect(available).not.toContain("platform_owner");
  });

  it("a super admin without a platform role still cannot read the platform appendix", () => {
    const available = availableGuideRoles("super_admin", null, perms("super_admin"));
    expect(available).toHaveLength(5);
    expect(available).not.toContain("platform_owner");
  });

  it("only a platform owner or platform admin reads the appendix", () => {
    for (const platformRole of ["platform_owner", "platform_admin"] as PlatformRole[]) {
      const available = availableGuideRoles(
        "administrator",
        platformRole,
        perms("administrator", platformRole),
      );
      expect(available).toContain("platform_owner");
      expect(canReadPlatformAppendix(platformRole, perms("administrator", platformRole))).toBe(
        true,
      );
    }
    expect(canReadPlatformAppendix(null, perms("super_admin"))).toBe(false);
  });

  it("a member with no recognised role still gets the front-line guide", () => {
    expect(availableGuideRoles(null, null, new Set())).toEqual(["agent"]);
  });

  it("guide access is never wider than the reader's authority", () => {
    const order: OrgRole[] = ["agent", "team_lead", "manager", "administrator", "super_admin"];
    for (const role of order) {
      for (const candidate of availableGuideRoles(role, null, perms(role))) {
        expect(GUIDE_ORDER).toContain(candidate);
      }
    }
  });
});

describe("which guide the reader lands on", () => {
  it("defaults to the reader's own role", () => {
    for (const role of ["agent", "team_lead", "manager", "administrator", "super_admin"] as const) {
      expect(defaultGuideRole(role, null, perms(role))).toBe(role);
    }
  });

  it("keeps a platform administrator on their organization role by default", () => {
    expect(defaultGuideRole("administrator", "platform_owner", perms("administrator", "platform_owner"))).toBe(
      "administrator",
    );
  });

  it("falls back to the platform appendix when there is no organization role", () => {
    expect(defaultGuideRole(null, "platform_owner", perms(null, "platform_owner"))).toBe(
      "platform_owner",
    );
  });

  it("falls back to the standard user guide when nothing is known", () => {
    expect(defaultGuideRole(null, null, new Set())).toBe("agent");
  });
});

/* -------------------------------------------------------------------------- */
/* Section visibility                                                          */
/* -------------------------------------------------------------------------- */

describe("section visibility inside a guide", () => {
  it("hides gated sections a reader's permissions do not unlock", () => {
    const guide = GUIDES.super_admin;
    const asAgent = visibleGuide(guide, perms("agent"));
    const asSuperAdmin = visibleGuide(guide, perms("super_admin"));
    expect(sectionIds(asAgent).length).toBeLessThan(sectionIds(asSuperAdmin).length);
  });

  it("never leaves an empty chapter behind", () => {
    for (const role of GUIDE_ORDER) {
      const visible = visibleGuide(GUIDES[role], perms("agent"));
      for (const chapter of visible.chapters) {
        expect(chapter.sections.length).toBeGreaterThan(0);
      }
    }
  });

  it("gives every guide a help chapter and a wrap-up chapter", () => {
    for (const role of GUIDE_ORDER) {
      const ids = GUIDES[role].chapters.map((chapter) => chapter.id);
      expect(ids).toContain("help-center");
      expect(ids).toContain("wrap-up");
    }
  });

  it("flattens sections into a stable reading order", () => {
    const flat = flattenSections(GUIDES.agent);
    expect(flat.length).toBe(sectionIds(GUIDES.agent).length);
    expect(flat[0]?.position).toBe(1);
    expect(flat.at(-1)?.position).toBe(flat.length);
  });

  it("points at the first unread section and then at nothing", () => {
    const guide = visibleGuide(GUIDES.agent, perms("agent"));
    const flat = flattenSections(guide);
    expect(nextUnreadSection(guide, new Set())?.id).toBe(flat[0]?.id);
    expect(nextUnreadSection(guide, new Set([flat[0]!.id]))?.id).toBe(flat[1]?.id);
    expect(nextUnreadSection(guide, new Set(flat.map((s) => s.id)))).toBeNull();
  });

  it("indexes searchable text in lower case", () => {
    const chapter = GUIDES.agent.chapters[0]!;
    const text = sectionSearchText(chapter.sections[0]!, chapter);
    expect(text).toBe(text.toLowerCase());
    expect(text.length).toBeGreaterThan(20);
  });

  it("resolves every guide role to a guide", () => {
    for (const role of GUIDE_ORDER) {
      expect(guideByRole(role).role).toBe(role);
    }
    expect(guideByRole("not-a-role" as GuideRole).role).toBe("agent");
  });
});

/* -------------------------------------------------------------------------- */
/* Progress isolation                                                          */
/* -------------------------------------------------------------------------- */

describe("reading progress stays with the right person and guide", () => {
  it("namespaces storage keys by user and by guide", () => {
    expect(progressStorageKey("user-a", "agent")).not.toBe(progressStorageKey("user-b", "agent"));
    expect(progressStorageKey("user-a", "agent")).not.toBe(
      progressStorageKey("user-a", "team_lead"),
    );
    expect(progressStorageKey(null, "agent")).toContain("anonymous");
  });

  it("keeps two people on one browser apart", () => {
    const storage = fakeStorage();
    writeCompletedSections(storage, "user-a", "agent", ["s1", "s2"]);
    writeCompletedSections(storage, "user-b", "agent", ["s3"]);
    expect(readCompletedSections(storage, "user-a", "agent")).toEqual(["s1", "s2"]);
    expect(readCompletedSections(storage, "user-b", "agent")).toEqual(["s3"]);
  });

  it("keeps one person's two guides apart", () => {
    const storage = fakeStorage();
    writeCompletedSections(storage, "user-a", "agent", ["s1"]);
    writeCompletedSections(storage, "user-a", "team_lead", ["s9"]);
    expect(readCompletedSections(storage, "user-a", "agent")).toEqual(["s1"]);
    expect(readCompletedSections(storage, "user-a", "team_lead")).toEqual(["s9"]);
  });

  it("restarting one guide leaves the others untouched", () => {
    const storage = fakeStorage();
    writeCompletedSections(storage, "user-a", "agent", ["s1"]);
    writeCompletedSections(storage, "user-a", "manager", ["s2"]);
    clearCompletedSections(storage, "user-a", "agent");
    expect(readCompletedSections(storage, "user-a", "agent")).toEqual([]);
    expect(readCompletedSections(storage, "user-a", "manager")).toEqual(["s2"]);
  });

  it("adds and removes a single tick without duplicates", () => {
    expect(toggleCompletedSection(["a"], "b", true)).toEqual(["a", "b"]);
    expect(toggleCompletedSection(["a", "b"], "b", false)).toEqual(["a"]);
    expect(toggleCompletedSection(["a"], "a", true)).toEqual(["a"]);
  });

  it("survives corrupt or missing storage records", () => {
    const storage = fakeStorage();
    storage.setItem(progressStorageKey("user-a", "agent"), "{not json");
    expect(readCompletedSections(storage, "user-a", "agent")).toEqual([]);
    expect(readCompletedSections(null, "user-a", "agent")).toEqual([]);
    expect(() => writeCompletedSections(null, "user-a", "agent", ["s1"])).not.toThrow();
  });

  it("reports completion as a whole percentage", () => {
    expect(completionPercent(0, 0)).toBe(0);
    expect(completionPercent(0, 10)).toBe(0);
    expect(completionPercent(1, 3)).toBe(33);
    expect(completionPercent(10, 10)).toBe(100);
  });
});

/* -------------------------------------------------------------------------- */
/* Review flags                                                                */
/* -------------------------------------------------------------------------- */

describe("guide review flags are tenant scoped and administrator only", () => {
  it("only administrators and above may flag a guide", () => {
    expect(canFlagGuideReview("agent", null)).toBe(false);
    expect(canFlagGuideReview("team_lead", null)).toBe(false);
    expect(canFlagGuideReview("manager", null)).toBe(false);
    expect(canFlagGuideReview("administrator", null)).toBe(true);
    expect(canFlagGuideReview("super_admin", null)).toBe(true);
    expect(canFlagGuideReview(null, "platform_owner")).toBe(true);
    expect(canFlagGuideReview(null, "platform_admin")).toBe(true);
    expect(canFlagGuideReview(null, null)).toBe(false);
  });

  it("namespaces the flag by organization and guide, not by reader", () => {
    expect(reviewStorageKey("org-a", "agent")).not.toBe(reviewStorageKey("org-b", "agent"));
    expect(reviewStorageKey("org-a", "agent")).not.toBe(reviewStorageKey("org-a", "manager"));
    expect(reviewStorageKey("org-a", "agent")).not.toBe(progressStorageKey("org-a", "agent"));
  });

  it("round-trips and clears a flag without touching another tenant", () => {
    const storage = fakeStorage();
    const flag = {
      status: "needs_review" as const,
      at: "2026-09-02T10:00:00.000Z",
      by: "Dana Reyes",
      version: TRAINING_GUIDE_VERSION,
    };
    writeReviewFlag(storage, "org-a", "agent", flag);
    writeReviewFlag(storage, "org-b", "agent", { ...flag, status: "reviewed" });

    expect(readReviewFlag(storage, "org-a", "agent")).toEqual(flag);
    expect(readReviewFlag(storage, "org-b", "agent")?.status).toBe("reviewed");

    clearReviewFlag(storage, "org-a", "agent");
    expect(readReviewFlag(storage, "org-a", "agent")).toBeNull();
    expect(readReviewFlag(storage, "org-b", "agent")?.status).toBe("reviewed");
  });

  it("ignores a stored value that is not a review flag", () => {
    const storage = fakeStorage();
    storage.setItem(reviewStorageKey("org-a", "agent"), JSON.stringify({ status: "maybe" }));
    expect(readReviewFlag(storage, "org-a", "agent")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Print controls                                                              */
/* -------------------------------------------------------------------------- */

describe("print and save as PDF", () => {
  it("names the handout after the guide, version and review date", () => {
    const title = printableTitle("Team Lead");
    expect(title).toContain("Team Lead");
    expect(title).toContain(TRAINING_GUIDE_VERSION);
    expect(title).toContain(TRAINING_REVIEWED_ON);
  });

  it("prints with the handout title and restores the page title afterwards", () => {
    const seen: string[] = [];
    const win = {
      document: { title: "Help & Training — Pacific Health Group Support Console" },
      print() {
        seen.push(win.document.title);
      },
    };
    expect(printGuide(win, "Administrator")).toBe(true);
    expect(seen).toEqual([printableTitle("Administrator")]);
    expect(win.document.title).toBe("Help & Training — Pacific Health Group Support Console");
  });

  it("restores the title even when the print dialog throws", () => {
    const win = {
      document: { title: "original" },
      print() {
        throw new Error("printer on fire");
      },
    };
    expect(() => printGuide(win, "Manager")).toThrow("printer on fire");
    expect(win.document.title).toBe("original");
  });

  it("does nothing during server rendering", () => {
    expect(printGuide(null, "Manager")).toBe(false);
    expect(printGuide(undefined, "Manager")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Version stamp                                                               */
/* -------------------------------------------------------------------------- */

describe("version stamp", () => {
  it("states the agreed review date and the build", () => {
    expect(TRAINING_REVIEWED_ON).toBe("2026-09-02");
    expect(formatReviewDate()).toBe("2 September 2026");
    const line = trainingVersionLine();
    expect(line).toContain(TRAINING_GUIDE_VERSION);
    expect(line).toContain(TRAINING_APP_BUILD);
    expect(line).toContain("2 September 2026");
  });
});

/* -------------------------------------------------------------------------- */
/* Sign-in providers                                                           */
/* -------------------------------------------------------------------------- */

describe("guides only teach sign-in methods the console offers", () => {
  it.each(GUIDE_ORDER)("%s guide never mentions an archived provider", (role) => {
    const text = guideText(GUIDES[role]).toLowerCase();
    expect(text).not.toContain("microsoft");
    expect(text).not.toContain("outlook");
    expect(text).not.toContain("azure");
  });

  it.each(GUIDE_ORDER)("%s guide teaches Google and email sign-in", (role) => {
    const text = guideText(GUIDES[role]).toLowerCase();
    expect(text).toContain("google");
    expect(text).toContain("password");
  });

  it("no illustration marker or caption mentions an archived provider", async () => {
    const { FIGURES } = await import("../src/components/training/figures");
    for (const [id, figure] of Object.entries(FIGURES)) {
      const text = [figure.title, figure.alt, ...figure.markers].join(" ").toLowerCase();
      expect(text, `figure ${id}`).not.toContain("microsoft");
    }
  });

  it("never calls an illustration a screenshot", () => {
    for (const role of GUIDE_ORDER) {
      const text = guideText(GUIDES[role]).toLowerCase();
      // "screenshots" may only appear as an instruction not to take them.
      for (const sentence of text.split(/[.!?]/)) {
        if (!sentence.includes("screenshot")) continue;
        expect(sentence).toMatch(/never|do not|don't|rather than|not screenshots/);
      }
    }
  });
});
