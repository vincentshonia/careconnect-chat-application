# AI escalation: answer more, escalate less

Today the assistant hands every uncertain question to a human and then goes permanently silent on that chat. After this change, only genuine crisis language pulls in a person automatically; otherwise the assistant keeps answering and simply offers the "Connect me / Leave a message" buttons, more insistently after two shaky answers in a row.

Two notes before we start:

- The crisis patterns and the confidence handling actually live in `src/lib/public-chat.server.ts`, not `src/lib/ai.server.ts` (which only holds the AI gateway helpers). The changes go where the code is.
- `conversations` has no `metadata` column today, so tracking the low-confidence streak needs a small database change.

## 1. Database

New migration, data-safe: add `metadata jsonb not null default '{}'::jsonb` to `public.conversations`. No policy or grant changes — existing conversation policies already cover it.

## 2. Answer quality (`src/lib/public-chat.server.ts`)

- Confidence 0.3–0.5: return the model's real answer with the hedge prefix "I may not have complete information on this, but…", keep its sources, and still mark `escalate: true`.
- Confidence below 0.3, or no matching knowledge: keep the existing canned low-confidence reply with no sources.
- Confidence 0.5+: unchanged.
- Tighten `CRISIS_PATTERNS` to first-person harm/emergency statements only:
  - `/\bI('m| am) (going to|about to) (hurt|kill)/i`
  - `/\b(suicid|kill myself|end my life)/i`
  - `/\b(having|I have) (a )?(heart attack|stroke|overdos)/i`
  - `/\b(can'?t|cannot) breathe\b/i`
  Remove the bare keywords `emergency`, `bleeding`, `chest pain`, `unconscious`, `want to die`, `hurt myself` as standalone triggers.

## 3. Message endpoint (`src/routes/api/public/chat/message.ts`)

- Call `handoffToHumans` only when `result.crisis` is true.
- Non-crisis low confidence: reply normally, leave conversation status untouched, increment `metadata.ai_low_confidence_streak`; a confident answer resets it to 0.
- Response gains `suggestHuman: streak >= 2` (widget untouched this step).
- History query becomes newest-first `.order("created_at", { ascending: false }).limit(20)`, then reversed, with `sender_type = 'system'` rows excluded before the model sees them.

## 4. Hand-off idempotency (`src/lib/handoff.server.ts`)

Load the conversation first. If `escalation_requested` is already true and status is `waiting`/`assigned`/`active`, return the existing department and assignment with no new event, notification or audit row. Otherwise proceed as today, and set `first_human_requested_at = COALESCE(first_human_requested_at, now())` in the status update.

## 5. Tests

New `tests/crisis-detection.test.ts`: true positives ("I'm going to kill myself", "I think I'm having a heart attack", "I can't breathe", "end my life") and false positives ("what is your emergency line", "is the after-hours line for emergencies", "I had chest pain last year and want to ask about coverage"). Plus a small unit test for the hedge/canned selection by confidence band, extracting that decision into a pure exported helper so it is testable without the AI gateway.

Then: typecheck, unit tests, and show the diff. Widget untouched.
