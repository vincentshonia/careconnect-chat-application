/**
 * Content model for the CareConnect Training Center.
 *
 * Guides are data, not JSX: the same structure feeds the on-screen reader, the
 * print handout, the search index and the automated tests that prove a reader
 * is never shown instructions for a screen their role cannot open.
 */
import type { OrgRole } from "@/lib/permissions";

/** Every guide the Training Center can render. */
export type GuideRole = OrgRole | "platform_owner";

/**
 * Permission gate attached to a chapter or section. A reader must hold at
 * least one permission in `anyOf` (when present) and every permission in
 * `allOf` (when present). No gate means "everyone who can open the console".
 */
export type Gate = {
  anyOf?: readonly string[];
  allOf?: readonly string[];
};

/** Identifiers of the annotated interface illustrations. */
export const FIGURE_IDS = [
  "sign-in",
  "console-tour",
  "dashboard-self",
  "dashboard-team",
  "dashboard-org",
  "inbox",
  "inbox-transfer",
  "intake",
  "contacts",
  "notifications",
  "profile",
  "knowledge",
  "ai-console",
  "quality",
  "reports",
  "websites",
  "departments",
  "routing",
  "staff",
  "organizations",
  "settings",
  "security",
  "audit",
  "widget-visitor",
] as const;

export type FigureId = (typeof FIGURE_IDS)[number];

export type QuizItem = {
  question: string;
  options: string[];
  /** Index into `options`. */
  answer: number;
  why: string;
};

export type Block =
  | { kind: "p"; text: string }
  | { kind: "lead"; text: string }
  | { kind: "steps"; title?: string; items: string[] }
  | { kind: "bullets"; title?: string; items: string[] }
  | { kind: "figure"; figure: FigureId; caption?: string }
  | {
      kind: "callout";
      tone: "note" | "warning" | "privacy" | "tip";
      title: string;
      text: string;
    }
  | { kind: "doDont"; dos: string[]; donts: string[] }
  | { kind: "table"; caption?: string; head: string[]; rows: string[][] }
  | { kind: "faq"; items: { q: string; a: string }[] }
  | { kind: "checklist"; title?: string; items: string[] }
  | { kind: "terms"; items: { term: string; definition: string }[] }
  | { kind: "quiz"; items: QuizItem[] };

export type Section = {
  /** Stable, unique within a guide. Used for anchors and progress records. */
  id: string;
  title: string;
  /** One line answering "what will I be able to do after this?". */
  summary?: string;
  gate?: Gate;
  blocks: Block[];
};

export type Chapter = {
  id: string;
  title: string;
  intro?: string;
  gate?: Gate;
  sections: Section[];
};

export type Guide = {
  role: GuideRole;
  /** Label exactly as the console names the role. */
  label: string;
  tagline: string;
  audience: string;
  /** Rough reading time for the whole guide. */
  duration: string;
  chapters: Chapter[];
};

/** True when a reader holding `permissions` may see gated content. */
export function gateAllows(gate: Gate | undefined, permissions: ReadonlySet<string>) {
  if (!gate) return true;
  if (gate.allOf && !gate.allOf.every((p) => permissions.has(p))) return false;
  if (gate.anyOf && !gate.anyOf.some((p) => permissions.has(p))) return false;
  return true;
}
