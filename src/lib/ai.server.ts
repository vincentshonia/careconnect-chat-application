/**
 * Lovable AI Gateway helpers. Server-only: never import from client code.
 */
const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export const CHAT_MODEL = "google/gemini-3.6-flash";
export const EMBEDDING_MODEL = "openai/text-embedding-3-small";

function apiKey(): string {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return key;
}

function headers() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey()}`,
  };
}

export class AiGatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function handle(res: Response) {
  if (res.ok) return res.json();
  const text = await res.text();
  if (res.status === 429)
    throw new AiGatewayError(429, "The assistant is busy right now. Please try again in a moment.");
  if (res.status === 402)
    throw new AiGatewayError(402, "AI credits are exhausted for this workspace.");
  throw new AiGatewayError(res.status, `AI gateway error (${res.status}): ${text.slice(0, 300)}`);
}

/** A slow model is still better than none, but a hung socket must not hang the visitor. */
const REQUEST_TIMEOUT_MS = 8000;
const TIMEOUT_MESSAGE =
  "The assistant is taking too long — try again or talk to a representative.";

/**
 * One fetch, one retry. Only network/timeout failures are retried: an HTTP
 * error is answered by the gateway and re-sending it would return the same.
 */
async function gatewayFetch(path: string, body: unknown): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetch(`${GATEWAY}${path}`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
    }
  }
  console.error("AI gateway request failed", {
    path,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
  throw new AiGatewayError(504, TIMEOUT_MESSAGE);
}

export async function embedText(input: string): Promise<number[]> {
  const [vector] = await embedTexts([input]);
  return vector;
}

/**
 * Embed several passages in one gateway call. The endpoint accepts an array,
 * so a document with ten chunks costs one round trip instead of ten. Very
 * large documents are split into batches to stay under the provider's cap.
 */
export async function embedTexts(inputs: string[], batchSize = 64): Promise<number[][]> {
  if (!inputs.length) return [];
  const vectors: number[][] = [];
  for (let i = 0; i < inputs.length; i += batchSize) {
    const batch = inputs.slice(i, i + batchSize);
    const res = await gatewayFetch("/embeddings", { model: EMBEDDING_MODEL, input: batch });
    const json = (await handle(res)) as {
      data: Array<{ embedding: number[]; index?: number }>;
    };
    const rows = [...json.data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const row of rows) vectors.push(row.embedding);
  }
  return vectors;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Ask for a JSON object and actually get one. Gemini occasionally wraps its
 * schema output in prose or a code fence, so an unparseable reply is retried
 * once with a blunt instruction before the caller falls back. The parse failure
 * is returned so it can be logged and the rate watched.
 */
export async function chatCompleteJson<T>(
  messages: ChatMessage[],
  options: { jsonSchema: Record<string, unknown>; temperature?: number },
): Promise<{ parsed: T | null; raw: string; parseError: string | null; retried: boolean }> {
  const raw = await chatComplete(messages, options);
  const first = tryParse<T>(raw);
  if (first.value !== null) {
    return { parsed: first.value, raw, parseError: null, retried: false };
  }

  const retryMessages: ChatMessage[] = [
    ...messages,
    {
      role: "system",
      content:
        "Your previous reply could not be parsed. Return ONLY a single JSON object matching the schema. No prose, no markdown, no code fences.",
    },
  ];
  const rawRetry = await chatComplete(retryMessages, options);
  const second = tryParse<T>(rawRetry);
  return {
    parsed: second.value,
    raw: rawRetry,
    parseError: second.value !== null ? null : `${first.error} (retry: ${second.error})`,
    retried: true,
  };
}

function tryParse<T>(raw: string): { value: T | null; error: string } {
  const text = (raw ?? "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return { value: JSON.parse(text) as T, error: "" };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function chatComplete(
  messages: ChatMessage[],
  options: { jsonSchema?: Record<string, unknown>; temperature?: number } = {},
): Promise<string> {
  const body: Record<string, unknown> = {
    model: CHAT_MODEL,
    messages,
  };
  if (options.temperature !== undefined) body.temperature = options.temperature;
  if (options.jsonSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "answer", strict: true, schema: options.jsonSchema },
    };
  }
  const res = await gatewayFetch("/chat/completions", body);
  const json = (await handle(res)) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}
