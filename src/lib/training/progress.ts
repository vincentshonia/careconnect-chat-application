/**
 * Training Center state that lives in the reader's browser.
 *
 * Two separate things are stored, with deliberately different scopes:
 *
 *  - Reading progress is personal. It is namespaced by user id *and* guide
 *    role, so two people sharing a workstation never see each other's ticks,
 *    and progress through the Team Lead guide is not confused with progress
 *    through the Standard User guide.
 *  - The "needs review" flag is a property of the organization, not of one
 *    reader, so it is namespaced by organization id and only administrators
 *    may write it.
 *
 * Everything here is pure apart from the tiny `browserStorage()` accessor,
 * which keeps the module safe to import during server rendering.
 */
import { ROLE_RANK, type OrgRole, type PlatformRole } from "@/lib/permissions";
import type { GuideRole } from "./types";

/** The slice of `localStorage` this module needs. Tests pass a fake. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Bump when the stored shape changes so old records are ignored, not crashed on. */
export const TRAINING_STORAGE_VERSION = "v1";

const PREFIX = `careconnect.training.${TRAINING_STORAGE_VERSION}`;

/** Per-person, per-guide progress key. */
export function progressStorageKey(userId: string | null | undefined, guideRole: GuideRole) {
  return `${PREFIX}.progress.${userId ?? "anonymous"}.${guideRole}`;
}

/** Per-tenant, per-guide review key. */
export function reviewStorageKey(
  organizationId: string | null | undefined,
  guideRole: GuideRole,
) {
  return `${PREFIX}.review.${organizationId ?? "no-org"}.${guideRole}`;
}

/** `localStorage` when it exists and is reachable, otherwise null. */
export function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    // Private browsing modes can throw on access rather than on write.
    const probe = window.localStorage;
    probe.getItem(`${PREFIX}.probe`);
    return probe;
  } catch {
    return null;
  }
}

function readJson<T>(storage: StorageLike | null, key: string): T | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage must never break reading the guide.
  }
}

/** Completed section ids for one reader and one guide. */
export function readCompletedSections(
  storage: StorageLike | null,
  userId: string | null | undefined,
  guideRole: GuideRole,
): string[] {
  const stored = readJson<unknown>(storage, progressStorageKey(userId, guideRole));
  if (!Array.isArray(stored)) return [];
  return stored.filter((item): item is string => typeof item === "string");
}

export function writeCompletedSections(
  storage: StorageLike | null,
  userId: string | null | undefined,
  guideRole: GuideRole,
  sectionIds: readonly string[],
) {
  writeJson(storage, progressStorageKey(userId, guideRole), [...new Set(sectionIds)]);
}

/** Pure add/remove used by the "Mark complete" control. */
export function toggleCompletedSection(
  current: readonly string[],
  sectionId: string,
  completed: boolean,
): string[] {
  const next = new Set(current);
  if (completed) next.add(sectionId);
  else next.delete(sectionId);
  return [...next];
}

/** "Restart guide" — clears this reader's ticks for this guide only. */
export function clearCompletedSections(
  storage: StorageLike | null,
  userId: string | null | undefined,
  guideRole: GuideRole,
) {
  if (!storage) return;
  try {
    storage.removeItem(progressStorageKey(userId, guideRole));
  } catch {
    // Ignore — the in-memory state is already cleared by the caller.
  }
}

/** Percentage complete, rounded, safe when a guide has no sections. */
export function completionPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

export type ReviewFlag = {
  status: "needs_review" | "reviewed";
  /** ISO timestamp. */
  at: string;
  /** Display name of whoever set it, for the on-screen note. */
  by: string | null;
  /** Guide version the decision applied to. */
  version: string;
};

function isReviewFlag(value: unknown): value is ReviewFlag {
  if (!value || typeof value !== "object") return false;
  const flag = value as Partial<ReviewFlag>;
  return (
    (flag.status === "needs_review" || flag.status === "reviewed") && typeof flag.at === "string"
  );
}

export function readReviewFlag(
  storage: StorageLike | null,
  organizationId: string | null | undefined,
  guideRole: GuideRole,
): ReviewFlag | null {
  const stored = readJson<unknown>(storage, reviewStorageKey(organizationId, guideRole));
  return isReviewFlag(stored) ? stored : null;
}

export function writeReviewFlag(
  storage: StorageLike | null,
  organizationId: string | null | undefined,
  guideRole: GuideRole,
  flag: ReviewFlag,
) {
  writeJson(storage, reviewStorageKey(organizationId, guideRole), flag);
}

export function clearReviewFlag(
  storage: StorageLike | null,
  organizationId: string | null | undefined,
  guideRole: GuideRole,
) {
  if (!storage) return;
  try {
    storage.removeItem(reviewStorageKey(organizationId, guideRole));
  } catch {
    // Ignore.
  }
}

/**
 * Only Administrators, Super Admins and platform administrators may mark a
 * guide as needing review. Everyone else reads the flag but cannot set it.
 */
export function canFlagGuideReview(
  role: OrgRole | null,
  platformRole: PlatformRole | null,
): boolean {
  if (platformRole === "platform_owner" || platformRole === "platform_admin") return true;
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK.administrator;
}
