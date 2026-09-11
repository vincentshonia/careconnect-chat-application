import { createFileRoute } from "@tanstack/react-router";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createQaReviewFn } from "@/lib/quality.functions";
import { saveCsv } from "@/lib/csv";
import { exportCsvFn } from "@/lib/exports.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QueryError } from "@/components/admin/QueryError";
import { useSessionContext } from "@/hooks/use-session-context";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pager } from "@/components/admin/Pager";
import { formatDateInZone } from "@/lib/org-time";

export const Route = createFileRoute("/_authenticated/quality")({
  head: () => ({
    meta: [
      { title: "Quality & QA — Pacific Health Group Support Console" },
      {
        name: "description",
        content:
          "Visitor satisfaction scores, transcript review, and agent QA scorecards for accuracy, tone and compliance.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: QualityPageRoute,
});

const CRITERIA = [
  { key: "accuracy_score", label: "Accuracy" },
  { key: "tone_score", label: "Tone & empathy" },
  { key: "compliance_score", label: "Compliance" },
  { key: "resolution_score", label: "Resolution" },
] as const;

type Review = {
  id: string;
  conversation_id: string;
  reviewer_name: string | null;
  overall_score: number | null;
  coaching_notes: string | null;
  flagged: boolean;
  created_at: string;
  accuracy_score: number;
  tone_score: number;
  compliance_score: number;
  resolution_score: number;
};

function QualityPageRoute() {
  return (
    <RequirePermission permission="reports.team" title="Quality & QA">
      <QualityPage />
    </RequirePermission>
  );
}

function QualityPage() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const [selected, setSelected] = useState<string | null>(null);
  // No pre-filled scores: a review must reflect a real judgement on all four
  // criteria, not whatever the form happened to default to.
  const [scores, setScores] = useState<Record<string, number | null>>({
    accuracy_score: null,
    tone_score: null,
    compliance_score: null,
    resolution_score: null,
  });
  const [notes, setNotes] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const organizationId = session.data?.organizationId ?? null;
  const [convPage, setConvPage] = useState(0);
  const [reviewPage, setReviewPage] = useState(0);
  const PAGE = 25;

  // Headline quality numbers are aggregated in SQL over every rating and
  // review, never averaged from whatever slice the browser happened to load.
  const summary = useQuery({
    queryKey: ["quality-summary", organizationId],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("quality_summary", { _org: organizationId! });
      if (error) throw error;
      return (data ?? {}) as Record<string, number | null>;
    },
  });

  const conversations = useQuery({
    queryKey: ["quality-conversations", convPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("conversations")
        .select("id, reference, subject, status, assigned_to, created_at, escalation_requested", {
          count: "exact",
        })
        // Stable ordering: created_at then id, so paging never repeats or skips.
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(convPage * PAGE, convPage * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const reviews = useQuery({
    queryKey: ["qa-reviews", reviewPage],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("qa_reviews")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(reviewPage * PAGE, reviewPage * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Review[], total: count ?? 0 };
    },
  });

  /**
   * Which of the conversations on screen already have a review — asked of the
   * server for exactly these ids, so the badge does not depend on whichever
   * page of reviews happens to be loaded.
   */
  const reviewedQuery = useQuery({
    queryKey: ["quality-reviewed", convPage],
    enabled: (conversations.data?.rows ?? []).length > 0,
    queryFn: async () => {
      const ids = (conversations.data?.rows ?? []).map((c) => c.id);
      const { data, error } = await supabase
        .from("qa_reviews")
        .select("conversation_id")
        .in("conversation_id", ids);
      if (error) throw error;
      return (data ?? []).map((r) => r.conversation_id as string);
    },
  });

  /** The conversation being reviewed, read directly rather than from the page. */
  const selectedConversation = useQuery({
    queryKey: ["quality-conversation", selected],
    enabled: Boolean(selected),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, organization_id, assigned_to")
        .eq("id", selected!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const transcript = useQuery({
    queryKey: ["quality-transcript", selected],
    enabled: Boolean(selected),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, sender_type, sender_name, body, created_at")
        .eq("conversation_id", selected!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const saveQaReview = useServerFn(createQaReviewFn);
  const saveReview = useMutation({
    mutationFn: async () => {
      const orgId = session.data?.organizationId;
      if (!orgId || !selected) throw new Error("Pick a conversation to review first.");
      const conversation = selectedConversation.data;
      if (!conversation)
        throw new Error("Still loading this conversation — try again in a moment.");
      if (CRITERIA.some((c) => scores[c.key] == null)) {
        throw new Error("Score all four criteria before saving.");
      }
      // The reviewer and the agent are stamped server-side from the session
      // and the conversation record.
      await saveQaReview({
        data: {
          conversationId: selected,
          accuracy: scores.accuracy_score!,
          tone: scores.tone_score!,
          compliance: scores.compliance_score!,
          resolution: scores.resolution_score!,
          notes: notes || null,
          flagged,
        },
      });
    },
    onSuccess: () => {
      setStatus("Review saved.");
      setNotes("");
      setFlagged(false);
      setScores({
        accuracy_score: null,
        tone_score: null,
        compliance_score: null,
        resolution_score: null,
      });
      queryClient.invalidateQueries({ queryKey: ["qa-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["quality-reviewed"] });
      queryClient.invalidateQueries({ queryKey: ["quality-summary"] });
    },
    onError: (e) => setStatus(e instanceof Error ? e.message : "Could not save review"),
  });

  const stats = summary.data ?? {};
  const ratingsTotal = Number(stats["ratings_total"] ?? 0);
  const reviewsTotal = Number(stats["reviews_total"] ?? 0);
  const csat = stats["csat"] == null ? null : Number(stats["csat"]);
  const positiveRate = stats["positive_rate"] == null ? null : Number(stats["positive_rate"]);
  const avgQa = stats["avg_qa"] == null ? "—" : Number(stats["avg_qa"]).toFixed(1);
  const flaggedTotal = Number(stats["flagged_total"] ?? 0);
  const reviewRows = reviews.data?.rows ?? [];
  const conversationRows = conversations.data?.rows ?? [];
  const reviewedIds = new Set(reviewedQuery.data ?? []);
  const scoresComplete = CRITERIA.every((c) => scores[c.key] != null);

  const runExport = useServerFn(exportCsvFn);
  const exportCsv = useMutation({
    mutationFn: async () => runExport({ data: { dataset: "quality" } }),
    onSuccess: (result) => {
      if (!result.rows) {
        toast.info("There are no reviews to export yet.");
        return;
      }
      saveCsv("qa-reviews", result.csv);
      toast.success(`Exported ${result.rows.toLocaleString()} reviews`);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not build that export"),
  });

  return (
    <AdminShell
      title="Quality & QA"
      description="Visitor satisfaction, transcript review, and agent scorecards for accuracy, tone and compliance."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportCsv.mutate()}
          disabled={exportCsv.isPending}
        >
          {exportCsv.isPending ? "Preparing…" : "Export CSV"}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="CSAT"
          value={csat == null ? "—" : `${csat.toFixed(1)} / 5`}
          hint={`${ratingsTotal} ratings`}
        />

        <Stat
          label="Positive ratings"
          value={positiveRate == null ? "—" : `${positiveRate}%`}
          hint="4 or 5 stars"
        />
        <Stat label="Avg. QA score" value={avgQa} hint={`${reviewsTotal} reviews logged`} />
        <Stat label="Flagged for coaching" value={flaggedTotal} hint="Needs follow-up" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-border">
          <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
            Recent conversations
          </h2>
          {conversations.error ? (
            <QueryError
              className="m-3"
              error={conversations.error}
              onRetry={() => conversations.refetch()}
              busy={conversations.isFetching}
            />
          ) : null}
          <ul className="max-h-[520px] divide-y divide-border overflow-y-auto">
            {conversationRows.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(c.id);
                    setStatus(null);
                  }}
                  className={`w-full px-4 py-3 text-left text-sm transition hover:bg-muted/60 ${
                    selected === c.id ? "bg-muted" : ""
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className="font-medium">{c.reference}</span>
                    {reviewedIds.has(c.id) ? (
                      <Badge variant="outline" className="text-[10px]">
                        reviewed
                      </Badge>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {c.subject ?? "Chat conversation"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pager
            page={convPage}
            pageSize={PAGE}
            total={conversations.data?.total ?? 0}
            onPage={setConvPage}
            noun="conversations"
            busy={conversations.isFetching}
          />
        </section>

        <section className="space-y-6">
          <div className="rounded-xl border border-border">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">Transcript</h2>
            <div className="max-h-72 space-y-3 overflow-y-auto p-4">
              {!selected ? (
                <p className="text-sm text-muted-foreground">
                  Select a conversation to review its transcript.
                </p>
              ) : (transcript.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {transcript.isLoading ? "Loading…" : "No messages in this conversation."}
                </p>
              ) : (
                (transcript.data ?? []).map((m) => (
                  <div key={m.id} className="text-sm">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {m.sender_name || m.sender_type}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <h2 className="text-sm font-semibold">Score this conversation</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {CRITERIA.map((c) => (
                <div key={c.key} className="space-y-2">
                  <Label>{c.label}</Label>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setScores({ ...scores, [c.key]: n })}
                        className={`h-8 w-8 rounded-lg border text-xs transition ${
                          scores[c.key] === n
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              <Label htmlFor="coaching">Coaching notes</Label>
              <Textarea
                id="coaching"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What went well, what to improve next time…"
              />
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[hsl(var(--primary))]"
                checked={flagged}
                onChange={(e) => setFlagged(e.target.checked)}
              />
              Flag for supervisor follow-up
            </label>

            <div className="mt-4 flex items-center gap-3">
              <Button
                onClick={() => {
                  setStatus(null);
                  saveReview.mutate();
                }}
                disabled={!selected || !scoresComplete || saveReview.isPending}
              >
                {saveReview.isPending ? "Saving…" : "Save review"}
              </Button>
              {!scoresComplete ? (
                <span className="text-sm text-muted-foreground">
                  Score all four criteria to save.
                </span>
              ) : null}
              {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
            </div>
          </div>

          <div className="rounded-xl border border-border">
            <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
              Recent QA reviews
            </h2>
            {reviews.error ? (
              <QueryError
                className="m-3"
                error={reviews.error}
                onRetry={() => reviews.refetch()}
                busy={reviews.isFetching}
              />
            ) : null}
            <ul className="divide-y divide-border">
              {reviewRows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Badge variant={r.flagged ? "destructive" : "outline"}>
                    {Number(r.overall_score ?? 0).toFixed(1)} / 5
                  </Badge>
                  <span className="text-muted-foreground">{r.reviewer_name ?? "Reviewer"}</span>
                  <span className="truncate text-muted-foreground">{r.coaching_notes ?? ""}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {formatDateInZone(r.created_at)}
                  </span>
                </li>
              ))}
              {reviewRows.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No reviews recorded yet.
                </li>
              ) : null}
            </ul>
            <Pager
              page={reviewPage}
              pageSize={PAGE}
              total={reviews.data?.total ?? 0}
              onPage={setReviewPage}
              noun="reviews"
              busy={reviews.isFetching}
            />
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
