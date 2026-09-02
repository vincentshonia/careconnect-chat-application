/**
 * Turns the static guide registry into exactly what one reader may see.
 *
 * Two independent filters apply, in this order:
 *  1. which guides a reader may open at all,
 *  2. which chapters and sections inside a guide their permissions unlock.
 *
 * Guide access rules (deliberately explicit, not clever):
 *  - Standard User  -> Standard User only
 *  - Team Lead      -> Standard User, Team Lead
 *  - Manager        -> Standard User, Team Lead, Manager
 *  - Administrator  -> every organization guide, never the platform appendix
 *  - Super Admin    -> every organization guide
 *  - Platform owner / platform admin -> the above plus the platform appendix
 *
 * The result is that nobody is ever taught a screen they cannot open, and no
 * reader can browse a higher role's playbook out of curiosity.
 */
import { ROLE_RANK, type OrgRole, type PlatformRole } from "@/lib/permissions";
import { GUIDES, GUIDE_ORDER } from "./registry";
import { gateAllows, type Block, type Chapter, type Guide, type GuideRole, type Section } from "./types";

/** The five organization guides, in ascending authority order. */
export const ORG_GUIDE_ORDER = GUIDE_ORDER.filter(
  (role): role is Exclude<GuideRole, "platform_owner"> => role !== "platform_owner",
);

/** True when the reader operates the platform itself, not just one tenant. */
export function canReadPlatformAppendix(
  platformRole: PlatformRole | null,
  permissions: ReadonlySet<string>,
): boolean {
  if (platformRole === "platform_owner" || platformRole === "platform_admin") return true;
  return permissions.has("platform.tenant_admin");
}

/** Guides a reader is allowed to open, in ascending authority order. */
export function availableGuideRoles(
  role: OrgRole | null,
  platformRole: PlatformRole | null,
  permissions: ReadonlySet<string>,
): GuideRole[] {
  const platform = canReadPlatformAppendix(platformRole, permissions);
  const rank = role ? ROLE_RANK[role] : 0;

  const org: GuideRole[] =
    rank >= ROLE_RANK.administrator || platform
      ? [...ORG_GUIDE_ORDER]
      : ORG_GUIDE_ORDER.filter((candidate) => ROLE_RANK[candidate] <= rank);

  // Everyone gets at least the front-line guide, so a member without a
  // recognised role still has onboarding material.
  const guides = org.length ? org : (["agent"] as GuideRole[]);
  return platform ? [...guides, "platform_owner"] : guides;
}

/** The guide a reader should land on: their own role whenever possible. */
export function defaultGuideRole(
  role: OrgRole | null,
  platformRole: PlatformRole | null,
  permissions: ReadonlySet<string>,
): GuideRole {
  const available = availableGuideRoles(role, platformRole, permissions);
  if (role && available.includes(role)) return role;
  if (!role && available.includes("platform_owner")) return "platform_owner";
  return available[0] ?? "agent";
}

/** Strips chapters and sections the reader's permissions do not unlock. */
export function visibleGuide(guide: Guide, permissions: ReadonlySet<string>): Guide {
  const chapters = guide.chapters
    .filter((chapter) => gateAllows(chapter.gate, permissions))
    .map((chapter) => ({
      ...chapter,
      sections: chapter.sections.filter((section) => gateAllows(section.gate, permissions)),
    }))
    .filter((chapter) => chapter.sections.length > 0);
  return { ...guide, chapters };
}

export function guideByRole(role: GuideRole): Guide {
  return GUIDES[role] ?? GUIDES.agent;
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "lead":
      return block.text;
    case "steps":
    case "bullets":
    case "checklist":
      return [block.title ?? "", ...block.items].join(" ");
    case "callout":
      return `${block.title} ${block.text}`;
    case "doDont":
      return [...block.dos, ...block.donts].join(" ");
    case "table":
      return [block.caption ?? "", ...block.head, ...block.rows.flat()].join(" ");
    case "faq":
      return block.items.map((item) => `${item.q} ${item.a}`).join(" ");
    case "terms":
      return block.items.map((item) => `${item.term} ${item.definition}`).join(" ");
    case "quiz":
      return block.items.map((item) => `${item.question} ${item.options.join(" ")} ${item.why}`).join(" ");
    case "figure":
      return block.caption ?? "";
    default:
      return "";
  }
}

/** Every readable string in a guide — used by tests and the search index. */
export function guideText(guide: Guide): string {
  return [
    guide.label,
    guide.tagline,
    guide.audience,
    ...guide.chapters.flatMap((chapter) => [
      chapter.title,
      chapter.intro ?? "",
      ...chapter.sections.flatMap((section) => [
        section.title,
        section.summary ?? "",
        ...section.blocks.map(blockText),
      ]),
    ]),
  ].join("\n");
}

/** Lowercased haystack used by the in-guide search box. */
export function sectionSearchText(section: Section, chapter: Chapter): string {
  return [chapter.title, section.title, section.summary ?? "", ...section.blocks.map(blockText)]
    .join(" ")
    .toLowerCase();
}

/** Every visible section id in a guide — the denominator for progress. */
export function sectionIds(guide: Guide): string[] {
  return guide.chapters.flatMap((chapter) => chapter.sections.map((section) => section.id));
}

export type FlatSection = {
  id: string;
  title: string;
  chapterTitle: string;
  /** 1-based position within the whole guide. */
  position: number;
};

/** Flat reading order, used for the Previous / Next controls. */
export function flattenSections(guide: Guide): FlatSection[] {
  const flat: FlatSection[] = [];
  for (const chapter of guide.chapters) {
    for (const section of chapter.sections) {
      flat.push({
        id: section.id,
        title: section.title,
        chapterTitle: chapter.title,
        position: flat.length + 1,
      });
    }
  }
  return flat;
}

/** The first section the reader has not ticked yet, or null when finished. */
export function nextUnreadSection(
  guide: Guide,
  completed: ReadonlySet<string>,
): FlatSection | null {
  return flattenSections(guide).find((section) => !completed.has(section.id)) ?? null;
}
