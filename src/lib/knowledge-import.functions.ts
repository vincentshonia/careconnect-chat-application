import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const sourceSchema = z.union([
  z.object({ kind: z.literal("url"), url: z.string().trim().min(4).max(2000) }),
  z.object({
    kind: z.literal("file"),
    filename: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().max(200).default(""),
    dataBase64: z.string().min(1).max(14_000_000),
  }),
]);

const inputSchema = z.object({
  mode: z.enum(["articles", "faqs"]),
  status: z.enum(["draft", "published"]).default("draft"),
  source: sourceSchema,
});

/**
 * Import a document or web link into the knowledge base: extract the text,
 * split it into topic-area articles (or FAQs), persist, and index for search.
 */
export const importKnowledgeSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    const organizationId = profile?.organization_id as string | undefined;
    if (!organizationId) throw new Error("No organization context available");

    const importer = await import("@/lib/knowledge-import.server");

    let text = "";
    let sourceLabel = "";
    let sourceUrl: string | null = null;

    if (data.source.kind === "url") {
      const result = await importer.extractFromUrl(data.source.url);
      text = result.text;
      sourceLabel = result.title;
      sourceUrl = data.source.url;
    } else {
      text = await importer.extractFromFile({
        filename: data.source.filename,
        mimeType: data.source.mimeType ?? "",
        dataBase64: data.source.dataBase64,
      });
      sourceLabel = data.source.filename;
    }

    if (!text.trim()) throw new Error("No readable text was found in that source.");

    if (data.mode === "faqs") {
      const faqs = await importer.splitIntoFaqs(text, sourceLabel);
      if (!faqs.length) throw new Error("No FAQs could be derived from that source.");
      const { error } = await context.supabase.from("faqs").insert(
        faqs.map((f, i) => ({
          organization_id: organizationId,
          category: f.category || "General",
          question: f.question,
          answer: f.answer,
          applies_to_all: true,
          status: data.status === "published" ? ("active" as const) : ("inactive" as const),
          sort_order: i,
        })),
      );
      if (error) throw new Error(error.message);
      return { mode: "faqs" as const, created: faqs.length, indexed: 0, sourceLabel };
    }

    const articles = await importer.splitIntoArticles(text, sourceLabel);
    if (!articles.length) throw new Error("No articles could be derived from that source.");

    const { data: inserted, error } = await context.supabase
      .from("knowledge_articles")
      .insert(
        articles.map((a) => ({
          organization_id: organizationId,
          title: a.title.slice(0, 200),
          summary: a.summary?.slice(0, 500) || null,
          content: a.content,
          source_url: sourceUrl,
          status: data.status,
          applies_to_all: true,
          created_by: context.userId,
          updated_by: context.userId,
        })),
      )
      .select("id");
    if (error) throw new Error(error.message);

    let indexed = 0;
    if (data.status === "published") {
      const { reindexArticle } = await import("@/lib/knowledge-index.server");
      for (const row of inserted ?? []) {
        const result = await reindexArticle(row.id as string);
        indexed += result.chunks;
      }
    }

    return {
      mode: "articles" as const,
      created: (inserted ?? []).length,
      indexed,
      sourceLabel,
    };
  });
