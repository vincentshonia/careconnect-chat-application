# Better answers: hybrid search, grounding checks, Spanish support

Today the assistant finds knowledge only by meaning-similarity, and it decides for itself how confident it is. That misses exact strings people actually type (a plan name, a county, a phone number) and lets an unverified number slip into an answer. This work fixes both, and lets the assistant reply in Spanish.

## 1. Search that also matches exact words

Add a word index and a fuzzy-text index to the knowledge pieces, then a new combined search that runs meaning-search and word-search side by side and blends the two rankings. Exact things like "Enhanced Care Management", "San Bernardino" or a phone number will now be found even when the meaning-only search misses them.

Answers with a blended score below a floor are dropped as irrelevant. The floor will be chosen by running the three test questions against Pacific Health Group's real content and reporting the scores of the good matches versus the junk matches, so the number is justified rather than guessed.

## 2. Check the answer against the sources before the visitor sees it

After the model replies:
- It must point at least one source it used. If it names none, the answer is treated as low confidence.
- Every phone number, web address, dollar amount and percentage in the answer must appear word-for-word in the sources it cited. Anything that does not is removed from the answer and confidence drops to 0.4, which puts the answer behind the existing "I may not have complete information" hedge and offers a person.

Each check result is saved with the answer so quality reviewers can see how often the assistant strays.

## 3. Make the JSON reply reliable

If the model's structured reply cannot be read, it is asked once more with an explicit "return only JSON" instruction before falling back to the canned reply. Failures are recorded so the rate is visible.

## 4. Spanish

The visitor's language is passed into the assistant's instructions with "reply in the visitor's language". Language comes from the linked contact record when there is one, otherwise the browser language the widget reports. Spanish wording is added to the crisis phrases and to the canned "not confident" and emergency replies.

## Technical detail

**Migration**
- `knowledge_chunks`: generated `content_tsv tsvector` (english) + GIN index; GIN `gin_trgm_ops` index on `content`.
- `match_knowledge_hybrid(_org uuid, _website uuid, _embedding vector(1536), _query text, _k int)`: top-10 vector CTE + top-10 lexical CTE (`websearch_to_tsquery` ranked by `ts_rank_cd`, unioned with `similarity(content, _query)` trigram hits), reciprocal rank fusion `sum(1/(60+rank))` per chunk, returns the existing `match_knowledge` column set plus `fused_score`, `vector_rank`, `text_rank`. Same tenant/website/status filters and joins as `match_knowledge`. `SECURITY DEFINER`, revoked from `PUBLIC`/`anon`/`authenticated`, granted to `service_role`.
- `ai_responses`: add `metadata jsonb not null default '{}'` (the table has no metadata column today).
- `visitors`: add `preferred_language text` so the widget's browser language can be stored on session start.

**Code**
- `src/lib/public-chat.server.ts` `answerQuestion`: call `match_knowledge_hybrid` with the embedding and raw question, filter by the calibrated fused floor, thread a `language` hint into the system prompt, run the grounding check, and return a `diagnostics` object (fused scores, grounding result, stripped facts, parse_error) that `recordAiResponse` writes into `ai_responses.metadata`.
- `src/lib/ai.server.ts` `chatComplete`: one retry with an appended "Return only JSON, no prose." system instruction when `JSON.parse` fails; surface the parse failure to the caller for logging.
- New `src/lib/grounding.ts` (pure, testable): regexes for phone/URL/dollar/percent, verbatim containment check against cited chunk text, and the strip-and-downgrade result.
- `src/lib/ai-confidence.ts`: Spanish crisis patterns and Spanish canned replies, selected by the language hint.
- `src/routes/widget.tsx` + session start: send `navigator.language`; `escalate.ts` contact language continues to win when present.

**Tests** (`tests/grounding.test.ts`, extend `tests/crisis-detection.test.ts`): unsupported phone/URL/amount stripped and confidence lowered, supported facts preserved, empty `used_sources` → low confidence, Spanish crisis phrases detected, Spanish canned reply chosen.

**Verification**: typecheck, unit tests, then the three calibration questions run against PHG through the AI path, reporting per-question retrieved chunks, fused scores, chosen floor and rationale, and the grounding outcome.
