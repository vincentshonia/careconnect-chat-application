/**
 * CareConnect Training Center.
 *
 * A role-aware handbook for the console that only ever describes functionality
 * the reader can actually reach: guides are chosen by authority, and chapters
 * and sections are filtered by the same permission set the navigation uses.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpenCheck,
  Check,
  CircleCheck,
  Flag,
  GraduationCap,
  Printer,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
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
  guideByRole,
  sectionIds,
  sectionSearchText,
  visibleGuide,
} from "@/lib/training/select";
import type { GuideRole } from "@/lib/training/types";
import { trainingVersionLine } from "@/lib/training/version";
import {
  getTrainingStateFn,
  resetTrainingProgressFn,
  setTrainingProgressFn,
  setTrainingReviewFn,
  type TrainingState,
} from "@/lib/training/training.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({
    meta: [
      { title: "Training Center — Pacific Health Group Support Console" },
      {
        name: "description",
        content:
          "Role-based how-to guides for CareConnect: signing in, handling conversations, referrals, reporting and administration.",
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
  platform_owner: "Platform",
};

function TrainingPage() {
  const session = useSessionContext();
  const queryClient = useQueryClient();
  const permissions = useMemo(
    () => session.data?.permissions ?? new Set<string>(),
    [session.data?.permissions],
  );
  const role = (session.data?.role ?? null) as OrgRole | null;
  const platformRole = session.data?.platformRole ?? null;

  const available = useMemo(
    () => availableGuideRoles(role, platformRole, permissions),
    [role, platformRole, permissions],
  );
  const [selected, setSelected] = useState<GuideRole | null>(null);
  const activeRole: GuideRole =
    selected && available.includes(selected)
      ? selected
      : defaultGuideRole(role, platformRole, permissions);

  const guide = useMemo(
    () => visibleGuide(guideByRole(activeRole), permissions),
    [activeRole, permissions],
  );
  const allSectionIds = useMemo(() => sectionIds(guide), [guide]);

  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
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

  const fetchState = useServerFn(getTrainingStateFn);
  const stateQuery = useQuery({
    queryKey: ["training-state"],
    queryFn: async () => fetchState(),
  });
  const state = stateQuery.data;
  const completed = useMemo(
    () => new Set(state?.progress?.[activeRole] ?? []),
    [state, activeRole],
  );
  const doneCount = allSectionIds.filter((id) => completed.has(id)).length;
  const percent = allSectionIds.length
    ? Math.round((doneCount / allSectionIds.length) * 100)
    : 0;

  const saveProgress = useServerFn(setTrainingProgressFn);
  const toggleSection = useMutation({
    mutationFn: async (input: { sectionId: string; completed: boolean }) =>
      saveProgress({ data: { guideRole: activeRole, ...input } }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ["training-state"] });
      const previous = queryClient.getQueryData<TrainingState>(["training-state"]);
      queryClient.setQueryData<TrainingState>(["training-state"], (old) => {
        if (!old) return old;
        const current = new Set(old.progress[activeRole] ?? []);
        if (input.completed) current.add(input.sectionId);
        else current.delete(input.sectionId);
        return { ...old, progress: { ...old.progress, [activeRole]: [...current] } };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(["training-state"], context.previous);
      toast.error("Could not save your progress");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["training-state"] }),
  });

  const resetProgress = useServerFn(resetTrainingProgressFn);
  const reset = useMutation({
    mutationFn: async () => resetProgress({ data: { guideRole: activeRole } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-state"] });
      toast.success("Progress cleared for this guide");
    },
    onError: () => toast.error("Could not reset your progress"),
  });

  const saveReview = useServerFn(setTrainingReviewFn);
  const review = useMutation({
    mutationFn: async (status: "reviewed" | "needs_review") =>
      saveReview({ data: { guideRole: activeRole, status } }),
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["training-state"] });
      toast.success(
        status === "reviewed" ? "Guide marked as reviewed" : "Guide flagged for an update",
      );
    },
    onError: () => toast.error("Could not update the review state"),
  });

  const reviewFlag = state?.reviews?.find((entry) => entry.guide_role === activeRole) ?? null;
  const nextSectionId = allSectionIds.find((id) => !completed.has(id)) ?? null;

  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo?.({ top: 0 });
  }, [activeRole]);

  function jumpTo(id: string) {
    const target = document.getElementById(`section-${id}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.focus({ preventScroll: true });
  }

  return (
    <AdminShell
      title="Training Center"
      description="Step-by-step guides for the console, matched to your role and permissions."
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
          <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
          Print guide
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Guide header */}
        <section className="surface-glass panel-accent rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[240px] flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="gradient-brand grid h-9 w-9 place-items-center rounded-xl text-sidebar-primary-foreground">
                  <GraduationCap className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="text-xl font-semibold tracking-tight text-foreground">
                  {guide.label} guide
                </h2>
                {activeRole === role ? <Badge variant="secondary">Your role</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">{guide.tagline}</p>
              <p className="text-xs text-muted-foreground">
                {guide.audience} · {guide.duration} · {trainingVersionLine()}
              </p>
            </div>

            <div className="w-full max-w-[260px] space-y-2 print:hidden">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium text-foreground">Your progress</span>
                <span className="text-muted-foreground">
                  {doneCount}/{allSectionIds.length}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Guide completion"
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="gradient-brand h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {nextSectionId ? (
                  <Button size="sm" variant="secondary" onClick={() => jumpTo(nextSectionId)}>
                    <BookOpenCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                    {doneCount ? "Continue" : "Start"}
                  </Button>
                ) : (
                  <Badge className="bg-success/15 text-success hover:bg-success/15">
                    <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Guide complete
                  </Badge>
                )}
                {doneCount ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => reset.mutate()}
                    disabled={reset.isPending}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Reset
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Guide picker */}
          {available.length > 1 ? (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 print:hidden">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Guides
              </span>
              {available.map((candidate) => {
                const isActive = candidate === activeRole;
                return (
                  <button
                    key={candidate}
                    type="button"
                    onClick={() => setSelected(candidate)}
                    aria-pressed={isActive}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "gradient-brand text-sidebar-primary-foreground shadow-glow"
                        : "border border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {GUIDE_LABEL[candidate]}
                  </button>
                );
              })}
              <span className="text-xs text-muted-foreground">
                You can read the guides for your own role and the roles you supervise.
              </span>
            </div>
          ) : null}

          {/* Administrator review state */}
          {state?.canReview ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 print:hidden">
              <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {reviewFlag?.status === "reviewed" && reviewFlag.reviewed_at
                  ? `Checked against the live console on ${new Date(reviewFlag.reviewed_at).toLocaleDateString()}.`
                  : reviewFlag?.status === "needs_review"
                    ? "Flagged as needing an update."
                    : "This guide has not been checked against your console yet."}
              </p>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => review.mutate("reviewed")}
                  disabled={review.isPending}
                >
                  <CircleCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  Mark reviewed
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => review.mutate("needs_review")}
                  disabled={review.isPending}
                >
                  <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
                  Needs update
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Contents */}
          <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start print:hidden">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search this guide"
                aria-label="Search this guide"
                className="pl-9"
              />
            </div>
            <nav
              aria-label="Guide contents"
              className="max-h-[60vh] space-y-4 overflow-y-auto rounded-2xl border border-border bg-card/60 p-3"
            >
              {filtered.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  Nothing in this guide matches “{search}”.
                </p>
              ) : (
                filtered.map((chapter, chapterIndex) => (
                  <div key={chapter.id}>
                    <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {chapterIndex + 1}. {chapter.title}
                    </p>
                    <ul className="space-y-0.5">
                      {chapter.sections.map((section) => {
                        const done = completed.has(section.id);
                        return (
                          <li key={section.id}>
                            <button
                              type="button"
                              onClick={() => jumpTo(section.id)}
                              className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-primary/5 hover:text-foreground"
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

          {/* Guide body */}
          <div ref={contentRef} className="space-y-8">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No section of this guide mentions “{search}”. Try a different word, such as “claim”,
                “transfer”, “intake” or “password”.
              </div>
            ) : (
              filtered.map((chapter, chapterIndex) => (
                <section key={chapter.id} className="space-y-4">
                  <header className="space-y-1 border-b border-border pb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                      Chapter {chapterIndex + 1}
                    </p>
                    <h3 className="text-lg font-semibold tracking-tight text-foreground">
                      {chapter.title}
                    </h3>
                    {chapter.intro ? (
                      <p className="text-sm text-muted-foreground">{chapter.intro}</p>
                    ) : null}
                  </header>

                  {chapter.sections.map((section, sectionIndex) => {
                    const done = completed.has(section.id);
                    return (
                      <article
                        key={section.id}
                        id={`section-${section.id}`}
                        tabIndex={-1}
                        className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-panel outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6 print:break-inside-avoid print:shadow-none"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-[200px] flex-1">
                            <h4 className="text-base font-semibold text-foreground">
                              {chapterIndex + 1}.{sectionIndex + 1} {section.title}
                            </h4>
                            {section.summary ? (
                              <p className="mt-1 text-sm text-muted-foreground">{section.summary}</p>
                            ) : null}
                          </div>
                          <Button
                            size="sm"
                            variant={done ? "secondary" : "outline"}
                            className="print:hidden"
                            onClick={() =>
                              toggleSection.mutate({ sectionId: section.id, completed: !done })
                            }
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${done ? "text-success" : ""}`}
                              aria-hidden="true"
                            />
                            {done ? "Completed" : "Mark complete"}
                          </Button>
                        </div>

                        <div className="mt-2">
                          {section.blocks.map((block, index) => (
                            <BlockView key={`${section.id}-${index}`} block={block} />
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </section>
              ))
            )}

            <p className="pb-4 text-xs text-muted-foreground">
              {trainingVersionLine()}. This guide only describes features that exist in the console
              today. If a screen looks different, tell an administrator so the material can be
              re-checked.
            </p>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
