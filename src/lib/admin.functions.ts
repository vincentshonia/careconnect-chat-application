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
