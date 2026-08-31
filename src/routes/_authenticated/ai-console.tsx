import { createFileRoute } from "@tanstack/react-router";
import { RequirePermission } from "@/components/admin/RequirePermission";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { testAiAnswerFn } from "@/lib/admin.functions";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/ai-console")({
  head: () => ({
    meta: [
      { title: "AI Console — Pacific Health Group Support Console" },
      { name: "description", content: "Test chatbot answers against the live knowledge base before visitors see them." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AiConsolePageRoute,
});

type TestResult = Awaited<ReturnType<typeof testAiAnswerFn>>;

function AiConsolePageRoute() {
  return (
    <RequirePermission permission="knowledge.edit" title="the AI console">
      <AiConsolePage />
    </RequirePermission>
  );
}

function AiConsolePage() {
  const runTest = useServerFn(testAiAnswerFn);
  const [websiteId, setWebsiteId] = useState("");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const websites = useQuery({
    queryKey: ["websites-lite"],
    queryFn: async () => {
      const { data, error: err } = await supabase.from("websites").select("id, name").order("name");
      if (err) throw err;
      if (data?.length && !websiteId) setWebsiteId(data[0].id);
      return data ?? [];
    },
  });

  const ask = useMutation({
    mutationFn: async () => runTest({ data: { websiteId, question: question.trim() } }),
    onSuccess: (data) => {
      setError(null);
      setResult(data);
    },
    onError: (e) => {
      setResult(null);
      setError(e instanceof Error ? e.message : "Test failed");
    },
  });

  return (
    <AdminShell
      title="AI console"
      description="Ask the chatbot a question exactly as a visitor would. Answers use the same retrieval, guardrails and escalation rules as the live widget."
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <form
          className="space-y-4 rounded-xl border border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (websiteId && question.trim().length >= 3) ask.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="site">Website</Label>
            <select
              id="site"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={websiteId}
              onChange={(e) => setWebsiteId(e.target.value)}
            >
              {(websites.data ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="q">Test question</Label>
            <Textarea
              id="q"
              rows={4}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Do you help with Medi-Cal transportation in Los Angeles County?"
            />
          </div>
          <Button type="submit" disabled={ask.isPending || !websiteId}>
            {ask.isPending ? "Asking…" : "Run test"}
          </Button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </form>

        <div className="rounded-xl border border-border p-4">
          {!result ? (
            <p className="text-sm text-muted-foreground">
              Run a test to see the answer, confidence score, escalation decision, and which knowledge articles were
              used.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Confidence {Math.round((result.confidence ?? 0) * 100)}%</Badge>
                <Badge variant={result.escalate ? "default" : "secondary"}>
                  {result.escalate ? "Would offer a live agent" : "Answered by AI"}
                </Badge>
                {result.crisis ? <Badge variant="destructive">Crisis response</Badge> : null}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.answer}</p>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sources</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {(result.sources ?? []).length === 0 ? (
                    <li className="text-muted-foreground">No knowledge articles matched this question.</li>
                  ) : (
                    (result.sources ?? []).map((s: { title?: string; url?: string | null }, i: number) => (
                      <li key={i} className="text-muted-foreground">
                        {s.title ?? "Untitled article"}
                        {s.url ? ` — ${s.url}` : ""}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
