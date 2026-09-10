# Let the assistant use FAQs and services, not just articles

Today the assistant can only search knowledge articles. The FAQs and services shown in the widget are never turned into searchable text, so the assistant cannot answer from them. This plan makes all three searchable, keeps them fresh automatically when staff edit them, and adds a one-click rebuild.

## What changes for staff

- The assistant can answer from FAQs and services, and shows where an answer came from: "FAQ: <question>" or "Service: <name>".
- Editing, adding, deleting or turning a FAQ or service on/off re-teaches the assistant immediately. Same for saving an article.
- The Knowledge page gets a **Reindex all** button (for people who can edit knowledge) that rebuilds everything and reports how many pieces were created for articles, FAQs and services.
- Only people who can edit knowledge can rebuild, import, or use the assistant test console. Test-console questions now count toward the organization's monthly AI allowance, so testing can no longer quietly exceed it.

## Assumptions

- Only published FAQs and active services are indexed; drafts and inactive ones are removed from the index.
- Services have no "how to access" field in the system. A service will be indexed as name, short description, eligibility overview, coverage (counties and health plans) and the learn-more link. If a real "how to access" field is wanted, that is a separate small addition.

## Technical detail

**1. Migration**
- `knowledge_chunks`: add `source_type text not null default 'article'` with a check for `article | faq | service`, `source_id uuid`, `website_id uuid null`; make `article_id` nullable; backfill existing rows (`source_type='article'`, `source_id = article_id`); add a unique index on `(source_type, source_id, chunk_index)` and an index on `(organization_id, source_type, source_id)`.
- Replace `match_knowledge` so it returns `source_type` and `source_id` alongside the existing columns, includes chunks where `website_id IS NULL OR website_id = _website`, and applies the right published/active + website-scoping rule per source type (articles keep `applies_to_all OR _website = ANY(website_ids)`; FAQs and services use the same rule from their own rows). Keep `SECURITY DEFINER`, `search_path = public`, and the existing revoke from `anon, authenticated`.
- New `replace_chunks(_org uuid, _source_type text, _source_id uuid, _article_id uuid, _website_id uuid, _chunks jsonb)` plpgsql function: deletes that document's chunks and inserts the new ones in one transaction, so a failed reindex never leaves a document half-indexed. Revoked from `anon`/`authenticated`.

**2. `src/lib/knowledge-index.server.ts`**
- Add `indexFaq(id)` embedding `Q: {question}\nA: {answer}` and `indexService(id)` embedding the service fields above.
- One gateway call per document: collect all chunks and send them as an array to `embedText` (add an array-capable `embedTexts` in `ai.server.ts` using the existing `openai/text-embedding-3-small` model and 1536-dim column, batched under provider caps).
- Rewrite `reindexArticle` and the new indexers to persist through `replace_chunks`.
- `reindexOrganization` returns `{ articles, faqs, services, chunks }`.

**3. `chunkText`**
- Guarantee ~150 characters of overlap between consecutive chunks even for short paragraphs (carry the tail of the previous chunk forward), and prefix every chunk with the document title. Unit tests cover overlap with short paragraphs, long paragraphs, single short document, and the title prefix.

**4. Reindex triggers**
- New server functions in `src/lib/knowledge-content.functions.ts` for FAQ create/update/delete and service create/update/status-toggle, each guarded by `knowledge.edit` and org scope, performing the write and then the reindex. `knowledge.tsx` (FAQ tab) and `websites.tsx` (services tab) call these instead of writing directly from the browser.
- Article save calls the existing reindex path.
- `reindexAllFn` (`knowledge.edit`) behind the new **Reindex all** button, returning counts by source type.

**5. `src/lib/ai.server.ts` / retrieval**
- Sources are keyed by `source_type + source_id` and titled "FAQ: <question>" / "Service: <name>" / article title; the widget already renders titles.

**6. Permissions**
- `reindexArticleFn`, `testAiAnswerFn`, `importKnowledgeSourceFn` all require `knowledge.edit`; `testAiAnswerFn` runs the org budget check and records usage like the public path.

**7. Verification**
- Typecheck, production build, unit tests (new chunking and source-citation tests).
- Then run **Reindex all** for Pacific Health Group and report chunk counts by `source_type`.
