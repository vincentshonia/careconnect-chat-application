import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, requireOrganization, requirePermission } from "@/lib/authz.server";
import { z } from "zod";

/** Re-embed a single knowledge article so the chatbot can retrieve it. */
export const reindexArticleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ articleId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requirePermission(actor, "knowledge.edit");

    const { data: article, error } = await context.supabase
      .from("knowledge_articles")
      .select("id")
      .eq("id", data.articleId)
      .maybeSingle();
    if (error || !article) throw new Error("Article not found or not accessible");

    const { reindexArticle } = await import("@/lib/knowledge-index.server");
    const chunks = await reindexArticle(data.articleId);
    return { chunks };
  });

/** Rebuild the whole knowledge index for the caller's organization. */
export const reindexAllFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requirePermission(actor, "knowledge.edit");
    const organizationId = requireOrganization(actor);

    const { reindexOrganization } = await import("@/lib/knowledge-index.server");
    return await reindexOrganization(organizationId);
  });

/** Staff-only chatbot test console: run a question through the live RAG pipeline. */
export const testAiAnswerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ websiteId: z.string().uuid(), question: z.string().trim().min(3).max(500) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requirePermission(actor, "knowledge.edit");
    const organizationId = requireOrganization(actor);

    // RLS check: the caller must be able to see this website in their own org.
    const { data: website, error } = await context.supabase
      .from("websites")
      .select("id")
      .eq("id", data.websiteId)
      .maybeSingle();
    if (error || !website) throw new Error("Website not found or not accessible");

    const mod = await import("@/lib/public-chat.server");
    const full = await mod
      .admin()
      .from("websites")
      .select("*")
      .eq("id", data.websiteId)
      .maybeSingle();
    if (!full.data) throw new Error("Website not found");

    // A test question costs the same as a visitor question, so it counts too.
    const limits = await mod.orgLimits(organizationId);
    await mod.enforceAiBudget(organizationId, limits);

    const result = await mod.answerQuestion({
      website: full.data as Record<string, unknown>,
      question: data.question,
      history: [],
      conversationId: null,
    });

    await mod.recordUsage(organizationId, "ai_messages", 1);

    return {
      answer: result.answer,
      confidence: result.confidence,
      escalate: result.escalate,
      crisis: result.crisis,
      sources: result.sources,
    };
  });

/**
 * Health of the scheduled background jobs: the last 12 outbound calls the
 * database made, with the job they belong to and how each one ended.
 */
export const cronHealthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requirePermission(actor, "settings.manage");

    // Cron and pg_net internals are not exposed to signed-in roles, so this
    // read goes through a backend-only function after the check above.
    const { admin } = await import("@/lib/public-chat.server");
    const { data, error } = await admin().rpc("cron_health");
    if (error) throw new Error(error.message);

    return (
      (data ?? []) as {
        job_name: string | null;
        status_code: number | null;
        error_msg: string | null;
        timed_out: boolean | null;
        created: string;
      }[]
    ).map((row) => ({
      jobName: row.job_name ?? "Unknown job",
      statusCode: row.status_code,
      errorMsg: row.error_msg,
      timedOut: Boolean(row.timed_out),
      created: row.created,
    }));
  });

/**
 * Four setup values the Admin hub shows at a glance: whether the default
 * department can actually receive routed chats, whether admins are required to
 * use two-step verification, whether the live website is still in test mode,
 * and how the scheduled background jobs last finished.
 */
export const adminStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requirePermission(actor, "settings.manage");
    const organizationId = requireOrganization(actor);

    const [orgRes, deptRes, siteRes] = await Promise.all([
      context.supabase
        .from("organizations")
        .select("require_mfa_for_admins")
        .eq("id", organizationId)
        .maybeSingle(),
      context.supabase
        .from("departments")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_default", true)
        .maybeSingle(),
      context.supabase
        .from("websites")
        .select("id, name, domain, dev_mode")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
    ]);

    let defaultDepartmentMembers = 0;
    if (deptRes.data?.id) {
      const { count } = await context.supabase
        .from("department_members")
        .select("user_id", { count: "exact", head: true })
        .eq("department_id", deptRes.data.id);
      defaultDepartmentMembers = count ?? 0;
    }

    const sites = (siteRes.data ?? []) as {
      id: string;
      name: string | null;
      domain: string | null;
      dev_mode: boolean;
    }[];
    // A production site is anything that is not a preview/sandbox host.
    const production =
      sites.find((s) => !/lovable|preview|localhost|\.test$/i.test(s.domain ?? "")) ?? null;

    // Scheduled jobs: keep only the newest result per job.
    const { admin } = await import("@/lib/public-chat.server");
    const { data: cron } = await admin().rpc("cron_health");
    const seen = new Map<
      string,
      { statusCode: number | null; created: string; timedOut: boolean }
    >();
    for (const row of (cron ?? []) as {
      job_name: string | null;
      status_code: number | null;
      timed_out: boolean | null;
      created: string;
    }[]) {
      const name = row.job_name ?? "Unknown job";
      if (!seen.has(name)) {
        seen.set(name, {
          statusCode: row.status_code,
          created: row.created,
          timedOut: Boolean(row.timed_out),
        });
      }
    }

    return {
      defaultDepartment: deptRes.data
        ? { id: deptRes.data.id, name: deptRes.data.name, members: defaultDepartmentMembers }
        : null,
      requireMfaForAdmins: Boolean(orgRes.data?.require_mfa_for_admins),
      productionWebsite: production
        ? {
            id: production.id,
            name: production.name,
            domain: production.domain,
            devMode: production.dev_mode,
          }
        : null,
      jobs: [...seen.entries()].map(([jobName, v]) => ({ jobName, ...v })),
    };
  });
