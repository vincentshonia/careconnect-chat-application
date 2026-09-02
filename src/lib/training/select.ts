/**
 * Turns the static guide registry into exactly what one reader may see.
 *
 * Two independent filters apply, in this order:
 *  1. which guides a reader may open at all (never above their own authority),
 *  2. which chapters and sections inside a guide their permissions unlock.
 *
 * The result is that nobody is ever taught a screen they cannot open, and no
 * reader can browse a higher role's playbook out of curiosity.
 */
import { ROLE_RANK, type OrgRole, type PlatformRole } from "@/lib/permissions";
import { GUIDES, GUIDE_ORDER } from "./registry";
import { gateAllows, type Block, type Chapter, type Guide, type GuideRole, type Section } from "./types";

/** Guides a reader is allowed to open, in ascending authority order. */
export function availableGuideRoles(
  role: OrgRole | null,
  platformRole: PlatformRole | null,
  permissions: ReadonlySet<string>,
): GuideRole[] {
  const rank = role ? ROLE_RANK[role] : 0;
  const roles: GuideRole[] = GUIDE_ORDER.filter((candidate) => {
    if (candidate === "platform_owner") {
      return Boolean(platformRole) || permissions.has("platform.support_access");
    }
    return ROLE_RANK[candidate as OrgRole] <= rank;
  });
  // Everyone gets at least the front-line guide, so a member without a
  // recognised role still has onboarding material.
  return roles.length ? roles : ["agent"];
}

/** The guide a reader should land on. */
export function defaultGuideRole(
  role: OrgRole | null,
  platformRole: PlatformRole | null,
  permissions: ReadonlySet<string>,
): GuideRole {
  const available = availableGuideRoles(role, platformRole, permissions);
  if (role && available.includes(role)) return role;
  return available[available.length - 1] ?? "agent";
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
      return block.items.map((item) => item.question).join(" ");
    case "figure":
      return block.caption ?? "";
    default:
      return "";
  }
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
