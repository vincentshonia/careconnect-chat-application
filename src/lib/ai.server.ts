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

export async function embedText(input: string): Promise<number[]> {
  const res = await fetch(`${GATEWAY}/embeddings`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });
  const json = (await handle(res)) as { data: Array<{ embedding: number[] }> };
  return json.data[0].embedding;
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  const json = (await handle(res)) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}
