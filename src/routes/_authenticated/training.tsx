/**
 * CareConnect Help & Training.
 *
 * A role-aware handbook for the console that only ever describes functionality
 * the reader can actually reach: guides are chosen by authority, chapters and
 * sections are filtered by the same permission set the navigation uses, and
 * reading progress stays in the reader's own browser.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  GraduationCap,
  LifeBuoy,
  ListTree,
  Maximize2,
  Minimize2,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { BlockView } from "@/components/training/GuideBlocks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSessionContext } from "@/hooks/use-session-context";
import { ROLE_LABEL, type OrgRole } from "@/lib/permissions";
import {
  availableGuideRoles,
  defaultGuideRole,
  flattenSections,
  guideByRole,
  nextUnreadSection,
  sectionSearchText,
  visibleGuide,
} from "@/lib/training/select";
import {
  browserStorage,
  canFlagGuideReview,
  clearCompletedSections,
  clearReviewFlag,
  completionPercent,
  readCompletedSections,
  readReviewFlag,
  toggleCompletedSection,
  writeCompletedSections,
  writeReviewFlag,
  type ReviewFlag,
} from "@/lib/training/progress";
import { printGuide } from "@/lib/training/print";
import type { GuideRole } from "@/lib/training/types";
import {
  TRAINING_APP_BUILD,
  TRAINING_GUIDE_VERSION,
  formatReviewDate,
  trainingVersionLine,
} from "@/lib/training/version";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "Help & Training — Pacific Health Group Support Console" },
      {
        name: "description",
        content:
          "Role-based how-to guides for CareConnect staff: signing in, handling conversations, referrals, reporting, configuration and administration.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TrainingPage,
});

const GUIDE_LABEL: Record<GuideRole, string> = {
  agent: ROLE_LABEL.agent,
  team_lead: ROLE_LABEL.team_lead,
  manager: ROLE_LABEL.manager,
  administrator: ROLE_LABEL.administrator,
  super_admin: ROLE_LABEL.super_admin,
  platform_owner: "Platform Owner appendix",
};

const EMPTY_PERMISSIONS: ReadonlySet<string> = new Set<string>();

function TrainingPage() {
  const session = useSessionContext();

  const permissions = useMemo(
    () => session.data?.permissions ?? EMPTY_PERMISSIONS,
    [session.data?.permissions],
  );
  const role = (session.data?.role ?? null) as OrgRole | null;
  const platformRole = session.data?.platformRole ?? null;
  const userId = session.data?.userId ?? null;
  const organizationId = session.data?.organizationId ?? null;
  const readerName =
    session.data?.profile?.display_name ??
    session.data?.profile?.full_name ??
    session.data?.email ??
    null;

  /* ---------------------------------------------------------------- guide */

  const available = useMemo(
    () => availableGuideRoles(role, platformRole, permissions),
    [role, platformRole, permissions],
  );
  const fallbackRole = useMemo(
    () => defaultGuideRole(role, platformRole, permissions),
    [role, platformRole, permissions],
  );
  const [selected, setSelected] = useState<GuideRole | null>(null);
  const activeRole: GuideRole =
    selected && available.includes(selected) ? selected : fallbackRole;

  const guide = useMemo(
    () => visibleGuide(guideByRole(activeRole), permissions),
    [activeRole, permissions],
  );
  const flatSections = useMemo(() => flattenSections(guide), [guide]);
  const totalSections = flatSections.length;

  /* ------------------------------------------------------------- progress */

  const [completed, setCompleted] = useState<string[]>([]);
  useEffect(() => {
    setCompleted(readCompletedSections(browserStorage(), userId, activeRole));
  }, [userId, activeRole]);

  const completedSet = useMemo(() => new Set(completed), [completed]);
  const doneCount = flatSections.filter((section) => completedSet.has(section.id)).length;
  const percent = completionPercent(doneCount, totalSections);
  const nextUnread = useMemo(
    () => nextUnreadSection(guide, completedSet),
    [guide, completedSet],
  );

  const toggleSection = useCallback(
    (sectionId: string, done: boolean) => {
      setCompleted((previous) => {
        const next = toggleCompletedSection(previous, sectionId, done);
        writeCompletedSections(browserStorage(), userId, activeRole, next);
        return next;
      });
    },
    [userId, activeRole],
  );

  const restartGuide = useCallback(() => {
    clearCompletedSections(browserStorage(), userId, activeRole);
    setCompleted([]);
    toast.success("Progress cleared for this guide");
  }, [userId, activeRole]);

  /* --------------------------------------------------------------- review */

  const canReview = canFlagGuideReview(role, platformRole);
  const [reviewFlag, setReviewFlag] = useState<ReviewFlag | null>(null);
  useEffect(() => {
    setReviewFlag(readReviewFlag(browserStorage(), organizationId, activeRole));
  }, [organizationId, activeRole]);

  const setReview = useCallback(
    (status: ReviewFlag["status"]) => {
      const flag: ReviewFlag = {
        status,
        at: new Date().toISOString(),
        by: readerName,
        version: TRAINING_GUIDE_VERSION,
      };
      writeReviewFlag(browserStorage(), organizationId, activeRole, flag);
      setReviewFlag(flag);
      toast.success(
        status === "needs_review"
          ? "Guide flagged as needing review"
          : "Guide marked as checked against the console",
      );
    },
    [organizationId, activeRole, readerName],
  );

  const clearReview = useCallback(() => {
    clearReviewFlag(browserStorage(), organizationId, activeRole);
    setReviewFlag(null);
    toast.success("Review note removed");
  }, [organizationId, activeRole]);

  /* ------------------------------------------------- search and expansion */

  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const chapters = useMemo(() => {
    if (!query) return guide.chapters;
    return guide.chapters
      .map((chapter) => ({
        ...chapter,
        sections: chapter.sections.filter((section) =>
          sectionSearchText(section, chapter).includes(query),
        ),
      }))
      .filter((chapter) => chapter.sections.length > 0);
  }, [guide.chapters, query]);

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  useEffect(() => {
    setCollapsedSections(new Set());
  }, [activeRole]);

  const expandAll = () => setCollapsedSections(new Set());
  const collapseAll = () => setCollapsedSections(new Set(flatSections.map((s) => s.id)));
  const toggleCollapsed = (sectionId: string) =>
    setCollapsedSections((previous) => {
      const next = new Set(previous);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });

  const [tocOpen, setTocOpen] = useState(false);

  /* ------------------------------------------------------------ behaviour */

  const topRef = useRef<HTMLDivElement>(null);

  const jumpTo = useCallback((sectionId: string) => {
    setCollapsedSections((previous) => {
      if (!previous.has(sectionId)) return previous;
      const next = new Set(previous);
      next.delete(sectionId);
      return next;
    });
    // Let the section expand before scrolling to it.
    requestAnimationFrame(() => {
      const target = document.getElementById(`section-${sectionId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      target.focus({ preventScroll: true });
    });
    setTocOpen(false);
  }, []);

  const roleButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const onRoleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + delta + available.length) % available.length;
    setSelected(available[nextIndex]);
    roleButtonsRef.current[nextIndex]?.focus();
  };

  if (session.isLoading) {
    return (
      <AdminShell title="Help & Training" description="Loading your guide…">
        <div className="space-y-4" aria-busy="true">
          <div className="h-28 animate-pulse rounded-2xl bg-muted/60" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted/40" />
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell
      title="Help & Training"
      description="Plain-English guides for every screen your role can open."
      actions={
        <Button
          variant="outline"
          size="sm"
          className="print:hidden"
          onClick={() => printGuide(typeof window === "undefined" ? null : window, guide.label)}
        >
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          Print or save as PDF
        </Button>
      }
    >
      <div className="space-y-6" ref={topRef}>
        {/* ------------------------------------------------------ header */}
        <section
          className="surface-glass panel-accent rounded-2xl p-5 sm:p-6"
          aria-labelledby="training-guide-heading"
        >
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-[240px] flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="gradient-brand grid h-9 w-9 place-items-center rounded-xl text-sidebar-primary-foreground">
                  <GraduationCap className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2
                  id="training-guide-heading"
                  className="text-xl font-semibold tracking-tight text-foreground"
                >
                  {guide.label} guide
                </h2>
                {activeRole === role ? <Badge variant="secondary">Your role</Badge> : null}
                {activeRole === "platform_owner" ? (
                  <Badge variant="outline">Appendix</Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">{guide.tagline}</p>
              <p className="text-xs text-muted-foreground">
                {guide.audience} · {guide.duration} · {guide.chapters.length} chapters ·{" "}
                {totalSections} sections
              </p>
              <p className="text-xs text-muted-foreground">{trainingVersionLine()}</p>
            </div>

            <div className="w-full max-w-[280px] space-y-2 print:hidden">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground">Your progress</span>
                <span className="text-muted-foreground">
                  {doneCount}/{totalSections} · {percent}%
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${guide.label} guide completion`}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="gradient-brand h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {nextUnread ? (
                  <Button size="sm" variant="secondary" onClick={() => jumpTo(nextUnread.id)}>
                    <BookOpenCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                    {doneCount ? "Continue where I left off" : "Start here"}
                  </Button>
                ) : (
                  <Badge className="bg-success/15 text-success hover:bg-success/15">
                    <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Guide complete
                  </Badge>
                )}
                {doneCount ? (
                  <Button size="sm" variant="ghost" onClick={restartGuide}>
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Restart guide
                  </Button>
                ) : null}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Progress is saved in this browser for your account only.
              </p>
            </div>
          </div>

          {/* Guide selector */}
          {available.length > 1 ? (
            <div className="mt-5 space-y-2 border-t border-border/60 pt-4 print:hidden">
              <p
                id="training-guide-selector-label"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Choose a guide
              </p>
              <div
                role="radiogroup"
                aria-labelledby="training-guide-selector-label"
                className="flex flex-wrap items-center gap-2"
              >
                {available.map((candidate, index) => {
                  const isActive = candidate === activeRole;
                  return (
                    <button
                      key={candidate}
                      ref={(node) => {
                        roleButtonsRef.current[index] = node;
                      }}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      tabIndex={isActive ? 0 : -1}
                      onKeyDown={(event) => onRoleKeyDown(event, index)}
                      onClick={() => setSelected(candidate)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        isActive
                          ? "gradient-brand text-sidebar-primary-foreground shadow-glow"
                          : "border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      {GUIDE_LABEL[candidate]}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                You can read the guide for your own role and for the roles you supervise.
              </p>
            </div>
          ) : null}

          {/* Review state — visible to everyone, editable by administrators */}
          {reviewFlag || canReview ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 print:hidden">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {reviewFlag?.status === "needs_review"
                  ? `Flagged as needing an update${reviewFlag.by ? ` by ${reviewFlag.by}` : ""} on ${new Date(reviewFlag.at).toLocaleDateString()}.`
                  : reviewFlag?.status === "reviewed"
                    ? `Checked against this console${reviewFlag.by ? ` by ${reviewFlag.by}` : ""} on ${new Date(reviewFlag.at).toLocaleDateString()}.`
                    : "This guide has not been checked against your console yet."}
              </p>
              {canReview ? (
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setReview("reviewed")}>
                    <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                    Mark reviewed
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setReview("needs_review")}>
                    <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
                    Needs review
                  </Button>
                  {reviewFlag ? (
                    <Button size="sm" variant="ghost" onClick={clearReview}>
                      Clear note
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="grid gap-6 lg:grid-cols-[264px_minmax(0,1fr)]">
          {/* --------------------------------------------------- contents */}
          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start print:hidden">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search this guide"
                aria-label="Search this guide"
                className="pl-9"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="lg:hidden"
                aria-expanded={tocOpen}
                aria-controls="training-contents"
                onClick={() => setTocOpen((open) => !open)}
              >
                <ListTree className="mr-2 h-4 w-4" aria-hidden="true" />
                Contents
              </Button>
              <Button variant="ghost" size="sm" onClick={expandAll}>
                <Maximize2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Expand all
              </Button>
              <Button variant="ghost" size="sm" onClick={collapseAll}>
                <Minimize2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Collapse all
              </Button>
            </div>

            <nav
              id="training-contents"
              aria-label="Guide contents"
              className={`${tocOpen ? "block" : "hidden"} max-h-[62vh] space-y-4 overflow-y-auto rounded-2xl border border-border bg-card/60 p-3 lg:block`}
            >
              {chapters.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  Nothing in this guide matches “{search}”.
                </p>
              ) : (
                chapters.map((chapter, chapterIndex) => (
                  <div key={chapter.id}>
                    <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {chapterIndex + 1}. {chapter.title}
                    </p>
                    <ul className="space-y-0.5">
                      {chapter.sections.map((section) => {
                        const done = completedSet.has(section.id);
                        return (
                          <li key={section.id}>
                            <button
                              type="button"
                              onClick={() => jumpTo(section.id)}
                              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span
                                aria-hidden="true"
                                className={`mt-[3px] grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
                                  done
                                    ? "border-transparent bg-success text-success-foreground"
                                    : "border-border"
                                }`}
                              >
                                {done ? <Check className="h-2.5 w-2.5" /> : null}
                              </span>
                              <span className={done ? "text-foreground" : undefined}>
                                {section.title}
                                <span className="sr-only">{done ? " (completed)" : ""}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </nav>
          </aside>

          {/* ------------------------------------------------- guide body */}
          <div className="space-y-8">
            {chapters.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No section of this guide mentions “{search}”.
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try a different word, such as “claim”, “transfer”, “intake” or “password”.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setSearch("")}>
                  Clear search
                </Button>
              </div>
            ) : (
              chapters.map((chapter, chapterIndex) => (
                <section key={chapter.id} className="space-y-4" aria-labelledby={`chapter-${chapter.id}`}>
                  <header className="space-y-1 border-b border-border pb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Chapter {chapterIndex + 1}
                    </p>
                    <h3
                      id={`chapter-${chapter.id}`}
                      className="text-lg font-semibold tracking-tight text-foreground"
                    >
                      {chapter.title}
                    </h3>
                    {chapter.intro ? (
                      <p className="text-sm text-muted-foreground">{chapter.intro}</p>
                    ) : null}
                  </header>

                  {chapter.sections.map((section, sectionIndex) => {
                    const done = completedSet.has(section.id);
                    const collapsed = collapsedSections.has(section.id);
                    const position = flatSections.findIndex((item) => item.id === section.id);
                    const previous = position > 0 ? flatSections[position - 1] : null;
                    const next =
                      position >= 0 && position < flatSections.length - 1
                        ? flatSections[position + 1]
                        : null;

                    return (
                      <article
                        key={section.id}
                        id={`section-${section.id}`}
                        tabIndex={-1}
                        aria-labelledby={`heading-${section.id}`}
                        className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-panel outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6 print:break-inside-avoid print:shadow-none"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[200px] flex-1">
                            <h4
                              id={`heading-${section.id}`}
                              className="text-base font-semibold text-foreground"
                            >
                              {chapterIndex + 1}.{sectionIndex + 1} {section.title}
                            </h4>
                            {section.summary ? (
                              <p className="mt-1 text-sm text-muted-foreground">{section.summary}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 print:hidden">
                            <Button
                              size="sm"
                              variant={done ? "secondary" : "outline"}
                              aria-pressed={done}
                              onClick={() => toggleSection(section.id, !done)}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${done ? "text-success" : ""}`}
                                aria-hidden="true"
                              />
                              {done ? "Completed" : "Mark complete"}
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="min-h-9 min-w-9"
                              aria-expanded={!collapsed}
                              aria-controls={`body-${section.id}`}
                              aria-label={
                                collapsed
                                  ? `Expand section ${section.title}`
                                  : `Collapse section ${section.title}`
                              }
                              onClick={() => toggleCollapsed(section.id)}
                            >
                              <ChevronDown
                                className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                                aria-hidden="true"
                              />
                            </Button>
                          </div>
                        </div>

                        <div
                          id={`body-${section.id}`}
                          className={collapsed ? "hidden print:block" : "mt-2"}
                        >
                          {section.blocks.map((block, index) => (
                            <BlockView key={`${section.id}-${index}`} block={block} />
                          ))}

                          <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 print:hidden">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!previous}
                              onClick={() => previous && jumpTo(previous.id)}
                            >
                              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                              <span className="max-w-[16ch] truncate sm:max-w-[28ch]">
                                {previous ? `Previous: ${previous.title}` : "Previous"}
                              </span>
                            </Button>
                            <span className="text-xs text-muted-foreground">
                              Section {position + 1} of {totalSections}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!next}
                              onClick={() => next && jumpTo(next.id)}
                            >
                              <span className="max-w-[16ch] truncate sm:max-w-[28ch]">
                                {next ? `Next: ${next.title}` : "Next"}
                              </span>
                              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ))
            )}

            {/* -------------------------------------------- need help block */}
            <section
              aria-labelledby="training-need-help"
              className="rounded-2xl border border-primary/25 bg-primary/5 p-5 sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/12 text-primary">
                  <LifeBuoy className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="space-y-2">
                  <h3 id="training-need-help" className="text-base font-semibold text-foreground">
                    Still need help?
                  </h3>
                  <ul className="space-y-1.5 text-sm text-muted-foreground">
                    <li>
                      Ask your team lead about the day's work: queues, transfers and priorities.
                    </li>
                    <li>
                      Ask an administrator about access, roles, departments, routing, business hours
                      or settings.
                    </li>
                    <li>
                      Report anything that looks like a privacy or security problem to an
                      administrator immediately.
                    </li>
                    <li>
                      Include the reference number — for example PHG-2041 — and never paste member
                      details into an email or chat message.
                    </li>
                  </ul>
                  <div className="flex flex-wrap gap-2 pt-1 print:hidden">
                    <Button size="sm" variant="outline" onClick={() => jumpTo("help-need-help")}>
                      Open the help chapter
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                      }
                    >
                      Back to the top
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <footer className="space-y-1 pb-4 text-xs text-muted-foreground">
              <p>
                {guide.label} guide · version {TRAINING_GUIDE_VERSION} · last reviewed{" "}
                {formatReviewDate()} · application build {TRAINING_APP_BUILD}
              </p>
              <p>
                This guide only describes features that exist in the console today. Illustrations are
                drawn diagrams with invented names and numbers, never pictures of real member data.
                If a screen looks different, tell an administrator so the material can be re-checked.
              </p>
            </footer>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
