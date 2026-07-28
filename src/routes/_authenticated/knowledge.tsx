import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { reindexArticleFn } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

const STATUSES: Article["status"][] = ["draft", "pending_review", "approved", "published", "archived"];

function KnowledgePage() {
  return (
    <AdminShell
      title="Knowledge base"
      description="Articles feed the AI chatbot through vector search; FAQs appear in the widget."
    >
      <Tabs defaultValue="articles">
        <TabsList>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
        </TabsList>
        <TabsContent value="articles" className="mt-4">
          <Articles />
        </TabsContent>
        <TabsContent value="faqs" className="mt-4">
          <Faqs />
        </TabsContent>
      </Tabs>
    </AdminShell>
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

  useEffect(() => {
    if (active) {
      setForm({
        title: active.title,
        summary: active.summary ?? "",
        content: active.content,
        status: active.status,
      });
    }
  }, [active]);

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
      const result = await reindex({ data: { articleId: active.id } });
      return result;
    },
    onSuccess: (result) => {
      setNotice(result ? `Saved and re-indexed into ${result.chunks} chunks.` : "Saved.");
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
    },
    onError: (err) => setNotice(err instanceof Error ? err.message : "Save failed"),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="max-h-[70vh] overflow-y-auto rounded-xl border border-border">
        {listQuery.isLoading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y divide-border">
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
                    Updated {new Date(a.updated_at).toLocaleDateString()}
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
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving & re-indexing…" : "Save & re-index"}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}

function Faqs() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState({ category: "General", question: "", answer: "" });

  const faqQuery = useQuery({
    queryKey: ["kb-faqs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faqs")
        .select("*")
        .order("sort_order")
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Faq[];
    },
  });

  const orgId = faqQuery.data?.[0]?.organization_id ?? null;

  const create = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization context available");
      const { error } = await supabase.from("faqs").insert({
        organization_id: orgId,
        category: draft.category,
        question: draft.question,
        answer: draft.answer,
        applies_to_all: true,
        status: "active",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft({ category: "General", question: "", answer: "" });
      queryClient.invalidateQueries({ queryKey: ["kb-faqs"] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kb-faqs"] }),
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-3">
        {(faqQuery.data ?? []).map((f) => (
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
    </div>
  );
}
