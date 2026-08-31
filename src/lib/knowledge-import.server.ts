/**
 * Knowledge import: turn uploaded documents and web links into clean text,
 * then split that text into topic-area articles or FAQs with the AI gateway.
 * Server-only.
 */
import { chatComplete } from "./ai.server";

export const MAX_SOURCE_BYTES = 8 * 1024 * 1024; // 8MB
const MAX_TEXT_CHARS = 120_000;

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)));
}

export function htmlToText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped)
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function pdfToText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n\n") : text).replace(/\n{3,}/g, "\n\n").trim();
}

async function docxToText(bytes: Uint8Array): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(bytes);
  const doc = files["word/document.xml"];
  if (!doc) throw new Error("This .docx file could not be read.");
  const xml = strFromU8(doc);
  const text = xml
    .replace(/<w:p[^>]*>/g, "\n\n")
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text).replace(/\n{3,}/g, "\n\n").trim();
}

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Extract plain text from an uploaded file (base64 payload). */
export async function extractFromFile(input: {
  filename: string;
  mimeType: string;
  dataBase64: string;
}): Promise<string> {
  const bytes = base64ToBytes(input.dataBase64);
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error("File is larger than 8MB.");
  const name = input.filename.toLowerCase();
  const mime = input.mimeType.toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) return pdfToText(bytes);
  if (name.endsWith(".docx") || mime.includes("officedocument.wordprocessingml"))
    return docxToText(bytes);

  const text = new TextDecoder().decode(bytes);
  if (mime.includes("html") || name.endsWith(".html") || name.endsWith(".htm"))
    return htmlToText(text);
  if (name.endsWith(".doc"))
    throw new Error("Legacy .doc files are not supported — save as .docx or PDF.");
  return text.trim();
}

/** Fetch a public URL and extract its readable text (HTML, PDF, or plain text). */
export async function extractFromUrl(rawUrl: string): Promise<{ text: string; title: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid URL including https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only http(s) links are supported.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("That host is not allowed.");
  }

  const res = await fetch(url.toString(), {
    redirect: "follow",
    headers: { "User-Agent": "CareConnectKnowledgeBot/1.0", Accept: "text/html,application/pdf,text/plain,*/*" },
  });
  if (!res.ok) throw new Error(`Could not fetch that link (${res.status}).`);
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_SOURCE_BYTES) throw new Error("That document is larger than 8MB.");

  if (contentType.includes("pdf") || url.pathname.toLowerCase().endsWith(".pdf")) {
    return { text: await pdfToText(new Uint8Array(buffer)), title: url.pathname.split("/").pop() || url.hostname };
  }
  const raw = new TextDecoder().decode(buffer);
  if (contentType.includes("html") || raw.trimStart().startsWith("<")) {
    const match = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return {
      text: htmlToText(raw),
      title: match ? decodeEntities(match[1]).trim().slice(0, 160) : url.hostname,
    };
  }
  return { text: raw.trim(), title: url.pathname.split("/").pop() || url.hostname };
}

export type DraftArticle = { title: string; summary: string; content: string };
export type DraftFaq = { category: string; question: string; answer: string };

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as T;
}

/** Split source text into distinct topic-area knowledge articles. */
export async function splitIntoArticles(
  text: string,
  sourceLabel: string,
  maxArticles = 8,
): Promise<DraftArticle[]> {
  const source = text.slice(0, MAX_TEXT_CHARS);
  if (source.trim().length < 40) throw new Error("Not enough readable text in that source.");

  const raw = await chatComplete(
    [
      {
        role: "system",
        content:
          "You organize healthcare source material into a support knowledge base. " +
          "Split the document into distinct topic-area articles (one topic per article). " +
          "Rewrite content clearly in plain language, keep every factual detail (eligibility, " +
          "counties, health plans, phone numbers, hours, URLs) verbatim, and never invent facts. " +
          "Use markdown-style paragraphs and bullet lists in content.",
      },
      {
        role: "user",
        content: `Source: ${sourceLabel}\nProduce at most ${maxArticles} articles.\n\n---\n${source}`,
      },
    ],
    {
      temperature: 0.2,
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["articles"],
        properties: {
          articles: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "summary", "content"],
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                content: { type: "string" },
              },
            },
          },
        },
      },
    },
  );

  const parsed = parseJson<{ articles: DraftArticle[] }>(raw);
  return (parsed.articles ?? [])
    .filter((a) => a.title?.trim() && a.content?.trim())
    .slice(0, maxArticles);
}

/** Turn source text into FAQ question/answer pairs grouped by category. */
export async function splitIntoFaqs(
  text: string,
  sourceLabel: string,
  maxFaqs = 15,
): Promise<DraftFaq[]> {
  const source = text.slice(0, MAX_TEXT_CHARS);
  if (source.trim().length < 40) throw new Error("Not enough readable text in that source.");

  const raw = await chatComplete(
    [
      {
        role: "system",
        content:
          "You write FAQs for a healthcare support chat widget. Derive only questions the source " +
          "material actually answers. Answers are 1-3 short sentences in plain language, keeping " +
          "concrete details (eligibility, counties, plans, phone numbers, hours) exact. Never invent facts. " +
          "Category is a short topic label such as Eligibility, Enrollment, Services, or Contact.",
      },
      {
        role: "user",
        content: `Source: ${sourceLabel}\nProduce at most ${maxFaqs} FAQs.\n\n---\n${source}`,
      },
    ],
    {
      temperature: 0.2,
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["faqs"],
        properties: {
          faqs: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["category", "question", "answer"],
              properties: {
                category: { type: "string" },
                question: { type: "string" },
                answer: { type: "string" },
              },
            },
          },
        },
      },
    },
  );

  const parsed = parseJson<{ faqs: DraftFaq[] }>(raw);
  return (parsed.faqs ?? [])
    .filter((f) => f.question?.trim() && f.answer?.trim())
    .slice(0, maxFaqs);
}
