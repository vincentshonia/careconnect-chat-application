## Scope

Your spec covers three phases. Per your own instruction ("Complete and test Phase 1 before implementing Phase 2 or Phase 3"), this plan covers **Phase 1 only**. Phases 2 and 3 follow in later rounds.

## What Phase 1 delivers

**Backend (Lovable Cloud)**
- Multi-tenant schema: organizations, workspaces, websites, departments, users/profiles, user_roles (separate table, enum: super_admin, admin, manager, team_lead, agent), visitors, chat_sessions, conversations, messages, internal_notes, conversation_events, contacts, knowledge_categories, knowledge_articles, ai_responses, ai_source_references, business_hours, holidays, routing_rules, agent_statuses, audit_logs.
- Every tenant row carries organization_id / workspace_id / website_id.
- RLS on every table, scoped through a `has_role()` security-definer function plus org-membership helper. Cross-org reads impossible except for super_admin.
- Audit log table is insert-only for normal roles (no update/delete policies).

**AI chatbot (RAG)**
- pgvector knowledge chunks, embeddings via Lovable AI (`google/gemini-embedding-001`).
- Answering server function using `google/gemini-3.6-flash`, restricted to retrieved approved+published content, with configurable org/website AI instructions, refusal + escalation when confidence is low, emergency/crisis disclaimer handling, and stored citations + confidence per answer.
- Test console in admin to ask sample questions and inspect sources/confidence.

**Widget**
- Public `/widget.js` loader + iframe-rendered widget route, embedded with `<script src=".../widget.js" data-website-id="...">`.
- Domain allowlist enforced server-side; unauthorized domains refused.
- Config-driven: position, colors, logo, avatar, welcome + trigger message, trigger delay, size, radius, fonts, disclaimer.
- Proactive trigger bubble with localStorage-respecting dismissal.
- Five-button menu (Services, FAQ, Contact Us, Submit a Referral, Enrollment Assistance) — in Phase 1 Services/FAQ/Contact are live; Referral and Enrollment buttons open a lead-capture form and are marked as full-workflow in Phase 2.
- Free-text AI chat + "Speak with a Live Representative".

**Live agent escalation**
- Live-chat request form (name, phone, email + consent), queue insert, department routing (first available / round robin), realtime notification to agents.
- Visitor-facing queue statuses; offline path = leave a message.

**Admin backend**
- Auth (email/password + Google), protected `_authenticated` routes.
- Left sidebar shell: Dashboard, Inbox, Conversations, Contacts, Knowledge Base, Websites, Departments, Users & Roles, Business Hours, Routing, Reports, Audit Logs, Settings; Super Admin section for Organizations/Workspaces/Platform Users.
- Agent inbox with views (unassigned, mine, waiting, active, closed), realtime updates, filters/search.
- Conversation workspace: message thread, visitor info panel, internal ops panel (assign, status, priority, tags, internal notes — never visitor-visible), presence/typing so two agents don't collide.
- Knowledge base CRUD with statuses (draft → pending review → approved → published → archived), website/org scoping, versioning fields.
- Website management with generated install snippet, branding, allowed domains, config cloning.
- Basic reports: volume, AI containment, escalation rate, response times, leads.

**Demo data**
- Migration-seeded: 1 super admin, Pacific Health Group org, 2 websites, 3 departments, admin/manager/team lead/4 agents, 10 KB articles, 10 FAQs, 5 services, sample conversations, 5 templates. Fictional visitors only.

**Design**
- Healthcare-oriented design system in `src/styles.css` (calm teal/slate palette, no purple), semantic tokens only, WCAG 2.1 AA contrast, keyboard nav and focus states, responsive down to mobile.

## Technical notes

- TanStack Start; all AI calls, admin actions, and widget config reads go through server functions / server routes — no keys in the browser.
- Widget endpoints live under `/api/public/*` with per-website domain + origin validation and rate limiting.
- Realtime via Supabase channels for inbox, presence, and typing.
- Automated tests for the critical paths: RLS isolation, widget domain rejection, AI refusal path, escalation-to-queue, internal note visibility.

## Explicitly deferred (Phase 2/3)

Referral & enrollment full workflows with statuses, QA module, AI review queue, agent AI assist, custom roles, templates library management, tasks, SLAs, notifications beyond in-app, MFA, retention policies, integrations (RingCentral/Salesforce/Monday/SMS/webhooks/API keys), SSO, white-labeling, billing.

Phase 1 is large; I'll build it in sequence (schema+auth → admin shell → knowledge base + AI → widget → inbox/live chat → reports/audit) and verify each stage before moving on.