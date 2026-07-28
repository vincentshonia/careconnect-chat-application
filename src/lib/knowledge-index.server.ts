import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embedText } from "./ai.server";

function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Split article text into overlapping, paragraph-aware chunks. */
export function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).trim().length <= size) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }
    if (current) chunks.push(current);
    if (paragraph.length <= size) {
      current = paragraph;
    } else {
      for (let i = 0; i < paragraph.length; i += size - overlap) {
        chunks.push(paragraph.slice(i, i + size));
      }
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Rebuild embeddings for a single knowledge article. */
export async function reindexArticle(articleId: string) {
  const db = admin();
  const { data: article, error } = await db
    .from("knowledge_articles")
    .select("id, organization_id, title, summary, content, status")
    .eq("id", articleId)
    .maybeSingle();
  if (error || !article) throw new Error("Article not found");

  await db.from("knowledge_chunks").delete().eq("article_id", article.id);
  if (article.status !== "published") return { chunks: 0 };

  const source = [article.title, article.summary ?? "", article.content ?? ""].join("\n\n");
  const chunks = chunkText(source);

  let index = 0;
  for (const content of chunks) {
    const embedding = await embedText(content);
    const { error: insertError } = await db.from("knowledge_chunks").insert({
      article_id: article.id,
      organization_id: article.organization_id,
      chunk_index: index,
      content,
      embedding: embedding as unknown as string,
    });
    if (insertError) throw new Error(insertError.message);
    index += 1;
  }
  return { chunks: index };
}

/** Rebuild embeddings for every published article in an organization. */
export async function reindexOrganization(organizationId: string) {
  const db = admin();
  const { data: articles } = await db
    .from("knowledge_articles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "published");

  let total = 0;
  for (const article of articles ?? []) {
    const result = await reindexArticle(article.id as string);
    total += result.chunks;
  }
  return { articles: (articles ?? []).length, chunks: total };
}
