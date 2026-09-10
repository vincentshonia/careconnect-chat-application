import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { embedTexts } from "./ai.server";

function admin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type SourceType = "article" | "faq" | "service";

/**
 * Split text into chunks that always share ~`overlap` characters with the
 * previous chunk, so a sentence split across a boundary is still retrievable
 * from either side. Every chunk is prefixed with the document title, because
 * a chunk retrieved on its own must still say what it is about.
 */
export function chunkText(text: string, size = 1200, overlap = 150, title?: string): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  const prefix = title?.trim() ? `${title.trim()}\n\n` : "";
  const budget = Math.max(200, size - prefix.length);
  const step = Math.max(1, budget - overlap);

  // Paragraph-aware packing first: keep related sentences together.
  const paragraphs = clean.split(/\n{2,}/);
  const packed: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > budget) {
      if (current) {
        packed.push(current);
        current = "";
      }
      for (let i = 0; i < paragraph.length; i += step) {
        packed.push(paragraph.slice(i, i + budget));
        if (i + budget >= paragraph.length) break;
      }
      continue;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= budget) {
      current = candidate;
      continue;
    }
    if (current) packed.push(current);
    current = paragraph;
  }
  if (current) packed.push(current);

  // Then carry the tail of each chunk into the next one, so short paragraphs
  // overlap too rather than being packed edge to edge.
  const withOverlap: string[] = [];
  for (let i = 0; i < packed.length; i++) {
    const body = packed[i];
    if (i === 0) {
      withOverlap.push(body);
      continue;
    }
    const previous = packed[i - 1];
    const tail = previous.slice(Math.max(0, previous.length - overlap));
    const merged = `${tail}\n\n${body}`;
    withOverlap.push(merged.length <= budget + overlap ? merged : body);
  }

  return withOverlap.map((body) => `${prefix}${body}`);
}

type IndexInput = {
  organizationId: string;
  sourceType: SourceType;
  sourceId: string;
  articleId: string | null;
  websiteId: string | null;
  title: string;
  body: string;
};

/**
 * Embed a document and swap in its chunks atomically. The database function
 * deletes and inserts in one transaction, so a failed reindex can never leave
 * a document half-indexed.
 */
async function persistDocument(input: IndexInput) {
  const db = admin();
  const chunks = chunkText(input.body, 1200, 150, input.title);

  if (!chunks.length) {
    await db.rpc("replace_chunks", {
      _org: input.organizationId,
      _source_type: input.sourceType,
      _source_id: input.sourceId,
      _article_id: input.articleId,
      _website_id: input.websiteId,
      _chunks: [],
    });
    return { chunks: 0 };
  }

  const vectors = await embedTexts(chunks);
  const payload = chunks.map((content, index) => ({
    chunk_index: index,
    content,
    embedding: JSON.stringify(vectors[index]),
  }));

  const { error } = await db.rpc("replace_chunks", {
    _org: input.organizationId,
    _source_type: input.sourceType,
    _source_id: input.sourceId,
    _article_id: input.articleId,
    _website_id: input.websiteId,
    _chunks: payload,
  });
  if (error) throw new Error(error.message);
  return { chunks: chunks.length };
}

/** Remove every chunk for a document that is no longer published/active. */
async function clearDocument(
  organizationId: string,
  sourceType: SourceType,
  sourceId: string,
  articleId: string | null,
) {
  const { error } = await admin().rpc("replace_chunks", {
    _org: organizationId,
    _source_type: sourceType,
    _source_id: sourceId,
    _article_id: articleId,
    _website_id: null,
    _chunks: [],
  });
  if (error) throw new Error(error.message);
  return { chunks: 0 };
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

  if (article.status !== "published") {
    return clearDocument(article.organization_id, "article", article.id, article.id);
  }

  return persistDocument({
    organizationId: article.organization_id,
    sourceType: "article",
    sourceId: article.id,
    articleId: article.id,
    websiteId: null,
    title: article.title,
    body: [article.summary ?? "", article.content ?? ""].filter(Boolean).join("\n\n"),
  });
}

/** Build the searchable text for a FAQ. */
export function faqDocument(faq: { question: string; answer: string }) {
  return `Q: ${faq.question}\nA: ${faq.answer}`;
}

/** Build the searchable text for a service. */
export function serviceDocument(service: {
  name: string;
  short_description?: string | null;
  eligibility_overview?: string | null;
  counties?: string[] | null;
  health_plans?: string[] | null;
  learn_more_url?: string | null;
}) {
  const coverage = [
    service.counties?.length ? `Counties served: ${service.counties.join(", ")}` : "",
    service.health_plans?.length ? `Health plans: ${service.health_plans.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    service.name,
    service.short_description ?? "",
    service.eligibility_overview ? `Eligibility: ${service.eligibility_overview}` : "",
    coverage,
    service.learn_more_url ? `More information: ${service.learn_more_url}` : "",
  ]
    .filter((part) => part && part.trim())
    .join("\n");
}

/** Rebuild embeddings for a single FAQ. */
export async function indexFaq(faqId: string) {
  const db = admin();
  const { data: faq, error } = await db
    .from("faqs")
    .select("id, organization_id, question, answer, status")
    .eq("id", faqId)
    .maybeSingle();
  if (error || !faq) return clearDocumentUnknownOrg("faq", faqId);

  if (faq.status !== "active") {
    return clearDocument(faq.organization_id, "faq", faq.id, null);
  }

  return persistDocument({
    organizationId: faq.organization_id,
    sourceType: "faq",
    sourceId: faq.id,
    articleId: null,
    websiteId: null,
    title: `FAQ: ${faq.question}`,
    body: faqDocument(faq),
  });
}

/** Rebuild embeddings for a single service. */
export async function indexService(serviceId: string) {
  const db = admin();
  const { data: service, error } = await db
    .from("services")
    .select(
      "id, organization_id, name, short_description, eligibility_overview, counties, health_plans, learn_more_url, status",
    )
    .eq("id", serviceId)
    .maybeSingle();
  if (error || !service) return clearDocumentUnknownOrg("service", serviceId);

  if (service.status !== "active") {
    return clearDocument(service.organization_id, "service", service.id, null);
  }

  return persistDocument({
    organizationId: service.organization_id,
    sourceType: "service",
    sourceId: service.id,
    articleId: null,
    websiteId: null,
    title: `Service: ${service.name}`,
    body: serviceDocument(service),
  });
}

/** The row is gone (deleted): drop its chunks wherever they live. */
async function clearDocumentUnknownOrg(sourceType: SourceType, sourceId: string) {
  const { error } = await admin()
    .from("knowledge_chunks")
    .delete()
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  if (error) throw new Error(error.message);
  return { chunks: 0 };
}

/** Called after a FAQ or service is deleted. */
export async function removeIndexedSource(sourceType: SourceType, sourceId: string) {
  return clearDocumentUnknownOrg(sourceType, sourceId);
}

/** Rebuild embeddings for every published article, FAQ and service in an org. */
export async function reindexOrganization(organizationId: string) {
  const db = admin();
  const [articlesRes, faqsRes, servicesRes] = await Promise.all([
    db
      .from("knowledge_articles")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("status", "published"),
    db.from("faqs").select("id").eq("organization_id", organizationId).eq("status", "active"),
    db.from("services").select("id").eq("organization_id", organizationId).eq("status", "active"),
  ]);

  const counts = { articles: 0, faqs: 0, services: 0 };
  let chunks = 0;

  for (const row of articlesRes.data ?? []) {
    chunks += (await reindexArticle(row.id as string)).chunks;
    counts.articles += 1;
  }
  for (const row of faqsRes.data ?? []) {
    chunks += (await indexFaq(row.id as string)).chunks;
    counts.faqs += 1;
  }
  for (const row of servicesRes.data ?? []) {
    chunks += (await indexService(row.id as string)).chunks;
    counts.services += 1;
  }

  return { ...counts, chunks };
}
