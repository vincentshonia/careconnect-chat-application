import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Pager } from "@/components/admin/Pager";
import { useSessionContext } from "@/hooks/use-session-context";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/integrations/supabase/types";
import { reindexArticleFn, reindexAllFn } from "@/lib/admin.functions";
import {
  createFaqFn,
  deleteFaqFn,
  aiReviewQueueFn,
  dismissAiResponseFn,
} from "@/lib/knowledge-content.functions";
import { AdminShell } from "@/components/admin/AdminShell";
import { KnowledgeImport } from "@/components/admin/KnowledgeImport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateInZone } from "@/lib/org-time";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — Pacific Health Group Support Console" },
      {
        name: "description",
        content: "Manage the articles and FAQs that power the AI chatbot's answers.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KnowledgePage,
});

type Article = Database["public"]["Tables"]["knowledge_articles"]["Row"];
type Faq = Database["public"]["Tables"]["faqs"]["Row"];

const STATUSES: Article["status"][] = [
  "draft",
  "pending_review",
  "approved",
  "published",
  "archived",
];

function ReindexAllButton() {
  const session = useSessionContext();
  const reindexAll = useServerFn(reindexAllFn);
  const [result, setResult] = useState<string | null>(null);

  const run = useMutation({
    mutationFn: async () => await reindexAll({}),
    onSuccess: (r) =>
      setResult(
        `Re-indexed ${r.articles} articles, ${r.faqs} FAQs and ${r.services} services into ${r.chunks} searchable pieces.`,
      ),
    onError: (e) => setResult(e instanceof Error ? e.message : "Could not rebuild the index."),
  });

  if (!session.data?.can("knowledge.edit")) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" disabled={run.isPending} onClick={() => run.mutate()}>
        {run.isPending ? "Rebuilding…" : "Reindex all"}
      </Button>
      <p className="text-xs text-muted-foreground">
        {result ?? "Rebuilds the assistant's search index from articles, FAQs and services."}
      </p>
    </div>
  );
}

const REVIEW_PAGE = 10;

type FaqPrefill = { question: string; answer: string } | null;

function KnowledgePage() {
  const session = useSessionContext();
  const canEdit = session.data?.can("knowledge.edit") ?? false;
  const [tab, setTab] = useState("articles");
  const [prefill, setPrefill] = useState<FaqPrefill>(null);
  const reviewQueue = useServerFn(aiReviewQueueFn);

  const reviewCount = useQuery({
    queryKey: ["ai-review", 0],
    queryFn: async () => await reviewQueue({ data: { page: 0, pageSize: REVIEW_PAGE } }),
    enabled: canEdit,
  });

  return (
    <AdminShell
      title="Knowledge base"
      description="Articles, FAQs and services all feed the AI chatbot through vector search."
    >
      <ReindexAllButton />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          {canEdit ? (
            <TabsTrigger value="review" className="gap-2">
              AI review
              {reviewCount.data && reviewCount.data.total > 0 ? (
                <Badge variant="secondary">{reviewCount.data.total}</Badge>
              ) : null}
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="articles" className="mt-4">
          <Articles />
        </TabsContent>
        <TabsContent value="faqs" className="mt-4">
          <Faqs prefill={prefill} />
        </TabsContent>
        {canEdit ? (
          <TabsContent value="review" className="mt-4">
            <AiReview
              onCreateFaq={(question, answer) => {
                setPrefill({ question, answer });
                setTab("faqs");
              }}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </AdminShell>
  );
}

function AiReview({ onCreateFaq }: { onCreateFaq: (question: string, answer: string) => void }) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const reviewQueue = useServerFn(aiReviewQueueFn);
  const dismiss = useServerFn(dismissAiResponseFn);

  const listQuery = useQuery({
    queryKey: ["ai-review", page],
    queryFn: async () => await reviewQueue({ data: { page, pageSize: REVIEW_PAGE } }),
  });

  const dismissOne = useMutation({
    mutationFn: async (id: string) => await dismiss({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-review"] }),
  });

  const rows = listQuery.data?.rows ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Questions from the last 30 days where the assistant was unsure or the visitor was unhappy.
        Answer them once as an FAQ and the assistant will use it next time.
      </p>
      {listQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing needs review right now.</p>
      ) : (
        rows.map((r) => (
          <article key={r.id} className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Asked {r.occurrences}×</Badge>
              <Badge variant="outline">
                Confidence {r.confidence === null ? "—" : Math.round(Number(r.confidence) * 100)}%
              </Badge>
              {r.feedback === "negative" ? <Badge variant="destructive">Thumbs down</Badge> : null}
              <span className="text-xs text-muted-foreground">
                Last asked {formatDateInZone(r.lastAskedAt)}
              </span>
            </div>
            <h3 className="mt-2 text-sm font-semibold">{r.question}</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.answer}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => onCreateFaq(r.question, r.answer ?? "")}>
                Create FAQ from this
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={dismissOne.isPending}
                onClick={() => dismissOne.mutate(r.id)}
              >
                Dismiss
              </Button>
            </div>
          </article>
        ))
      )}
      <Pager
        page={page}
        pageSize={REVIEW_PAGE}
        total={listQuery.data?.total ?? 0}
        onPage={setPage}
        noun="questions"
        busy={listQuery.isFetching}
      />
    </div>
  );
}

function Articles() {
  const queryClient = useQueryClient();
  const reindex = useServerFn(reindexArticleFn);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", summary: "", content: "", status: "published" });
  const [notice, setNotice] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ["kb-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_articles")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Article[];
    },
  });

  const articles = listQuery.data ?? [];
  const active = articles.find((a) => a.id === activeId) ?? null;

  // Keyed on the record id, not the query object: a background refetch must
  // not wipe out edits the author has not saved yet.
  useEffect(() => {
    if (active) {
      setForm({
        title: active.title,
        summary: active.summary ?? "",
        content: active.content,
        status: active.status,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  const save = useMutation({
    mutationFn: async () => {
      if (!active) return;
      const { error } = await supabase
        .from("knowledge_articles")
        .update({
          title: form.title,
          summary: form.summary || null,
          content: form.content,
          status: form.status as Article["status"],
        })
        .eq("id", active.id);
      if (error) throw error;
      await logAudit({
        action: "knowledge_article.updated",
        recordType: "knowledge_articles",
        recordId: active.id,
        previousValue: { title: active.title, status: active.status },
        newValue: { title: form.title, status: form.status },
      });
      const result = await reindex({ data: { articleId: active.id } });
      return result;
    },
    onSuccess: (result) => {
      setNotice(result ? `Saved and re-indexed into ${result.chunks} chunks.` : "Saved.");
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Save failed"),
  });

  const createArticle = useMutation({
    mutationFn: async () => {
      const orgId =
        articles[0]?.organization_id ??
        (await supabase.from("organizations").select("id").limit(1).single()).data?.id;
      if (!orgId) throw new Error("No organization context available");
      const { data, error } = await supabase
        .from("knowledge_articles")
        .insert({
          organization_id: orgId,
          title: "Untitled article",
          content: "",
          status: "draft",
        })
        .select("id")
        .single();
      if (error) throw error;
      await logAudit({
        action: "knowledge_article.created",
        recordType: "knowledge_articles",
        recordId: data.id,
      });
      return data.id as string;
    },
    onSuccess: async (id) => {
      setNotice("New draft created — edit and save to index it.");
      await queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
      setActiveId(id);
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Create failed"),
  });

  const removeArticle = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("knowledge_articles").delete().eq("id", id);
      if (error) throw error;
      await logAudit({
        action: "knowledge_article.deleted",
        recordType: "knowledge_articles",
        recordId: id,
      });
    },
    onSuccess: async () => {
      setActiveId(null);
      setNotice("Article deleted.");
      await queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Delete failed"),
  });

  return (
    <div className="space-y-4">
      <KnowledgeImport mode="articles" />
      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex max-h-[70vh] flex-col overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border p-3">
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={createArticle.isPending}
              onClick={() => {
                setNotice(null);
                createArticle.mutate();
              }}
            >
              {createArticle.isPending ? "Creating…" : "New article"}
            </Button>
          </div>
          {listQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="divide-y divide-border overflow-y-auto">
              {articles.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(a.id)}
                    className={`w-full px-4 py-3 text-left hover:bg-accent ${a.id === activeId ? "bg-accent" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{a.title}</span>
                      <Badge variant="outline">{a.status}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      Updated {formatDateInZone(a.updated_at)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="rounded-xl border border-border p-4">
          {!active ? (
            <p className="text-sm text-muted-foreground">Select an article to edit.</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setNotice(null);
                save.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Summary</Label>
                <Input
                  id="summary"
                  value={form.summary}
                  onChange={(e) => setForm({ ...form, summary: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select
                  id="status"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  rows={16}
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                />
              </div>
              {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? "Saving & re-indexing…" : "Save & re-index"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={removeArticle.isPending}
                  onClick={() => {
                    if (confirm("Delete this article? Its indexed chunks are removed too.")) {
                      removeArticle.mutate(active.id);
                    }
                  }}
                >
                  {removeArticle.isPending ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}

function Faqs({ prefill }: { prefill?: FaqPrefill }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ category: "General", question: "", answer: "" });

  useEffect(() => {
    if (prefill) {
      setDraft((d) => ({ ...d, question: prefill.question, answer: prefill.answer }));
    }
  }, [prefill]);
  const [page, setPage] = useState(0);
  const PAGE = 25;
  const session = useSessionContext();

  const faqQuery = useQuery({
    queryKey: ["kb-faqs", page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("faqs")
        .select("*", { count: "exact" })
        // sort_order alone repeats across pages when values tie; id breaks it.
        .order("sort_order")
        .order("id")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as Faq[], total: count ?? 0 };
    },
  });

  const orgId = session.data?.organizationId ?? faqQuery.data?.rows?.[0]?.organization_id ?? null;

  const createFaq = useServerFn(createFaqFn);
  const deleteFaq = useServerFn(deleteFaqFn);

  const create = useMutation({
    mutationFn: async () => {
      await createFaq({
        data: { category: draft.category, question: draft.question, answer: draft.answer },
      });
      await logAudit({
        action: "faq.created",
        recordType: "faqs",
        newValue: { category: draft.category, question: draft.question },
      });
    },
    onSuccess: () => {
      setDraft({ category: "General", question: "", answer: "" });
      queryClient.invalidateQueries({ queryKey: ["kb-faqs"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await deleteFaq({ data: { id } });
      await logAudit({ action: "faq.deleted", recordType: "faqs", recordId: id });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kb-faqs"] }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3">
        {(faqQuery.data?.rows ?? []).map((f) => (
          <article key={f.id} className="rounded-xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge variant="outline">{f.category}</Badge>
                <h3 className="mt-2 text-sm font-semibold">{f.question}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.answer}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => remove.mutate(f.id)}>
                Delete
              </Button>
            </div>
          </article>
        ))}
        <Pager
          page={page}
          pageSize={PAGE}
          total={faqQuery.data?.total ?? 0}
          onPage={setPage}
          noun="FAQs"
          busy={faqQuery.isFetching}
        />
      </div>

      <form
        className="h-fit space-y-3 rounded-xl border border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="text-sm font-semibold">Add FAQ</h2>
        <div className="space-y-2">
          <Label htmlFor="cat">Category</Label>
          <Input
            id="cat"
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="q">Question</Label>
          <Input
            id="q"
            value={draft.question}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="a">Answer</Label>
          <Textarea
            id="a"
            rows={5}
            value={draft.answer}
            onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
            required
          />
        </div>
        {create.error ? (
          <p className="text-sm text-destructive">{(create.error as Error).message}</p>
        ) : null}
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Adding…" : "Add FAQ"}
        </Button>
      </form>
      <div className="lg:col-start-2 lg:row-start-2">
        <KnowledgeImport mode="faqs" />
      </div>
    </div>
  );
}
