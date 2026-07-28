import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Re-embed a single knowledge article so the chatbot can retrieve it. */
export const reindexArticleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ articleId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: article, error } = await context.supabase
      .from("knowledge_articles")
      .select("id")
      .eq("id", data.articleId)
      .maybeSingle();
    if (error || !article) throw new Error("Article not found or not accessible");

    const { reindexArticle } = await import("@/lib/knowledge-index.server");
    const chunks = await reindexArticle(data.articleId);
    return { chunks };
  });

/** Staff-only chatbot test console: run a question through the live RAG pipeline. */
export const testAiAnswerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ websiteId: z.string().uuid(), question: z.string().trim().min(3).max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS check: the caller must be able to see this website in their own org.
    const { data: website, error } = await context.supabase
      .from("websites")
      .select("id")
      .eq("id", data.websiteId)
      .maybeSingle();
    if (error || !website) throw new Error("Website not found or not accessible");

    const mod = await import("@/lib/public-chat.server");
    const full = await mod.admin()
      .from("websites")
      .select("*")
      .eq("id", data.websiteId)
      .maybeSingle();
    if (!full.data) throw new Error("Website not found");

    const result = await mod.answerQuestion({
      website: full.data as Record<string, unknown>,
      question: data.question,
      history: [],
      conversationId: null,
    });

    return {
      answer: result.answer,
      confidence: result.confidence,
      escalate: result.escalate,
      crisis: result.crisis,
      sources: result.sources,
    };
  });
