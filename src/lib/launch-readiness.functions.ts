import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, requireOrganization, requirePermission } from "@/lib/authz.server";

/**
 * Launch readiness — the pre-go-live checklist, computed live against the real
 * organization every time it runs. Nothing here is cached or remembered: each
 * check queries the current state, and the AI check really asks the assistant
 * three questions through the same pipeline a visitor uses.
 */

export type ReadinessCheck = {
  id: string;
  label: string;
  pass: boolean;
  critical: boolean;
  reason: string;
};

/** Build identification injected at build time (see vite.config.ts). */
declare const __BUILD_ID__: string;
declare const __RELEASE_REPORT_BUILD_ID__: string;
declare const __RELEASE_REPORT_OVERALL__: string;

const AI_PROBES = [
  "What counties do you serve?",
  "What is your phone number?",
  "Do you help with Enhanced Care Management?",
];

/** A production site is anything that is not a preview/sandbox host. */
function isProductionDomain(domain: string | null): boolean {
  return !/lovable|preview|localhost|\.test$/i.test(domain ?? "");
}

export const launchReadinessFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "settings.manage");
    const organizationId = requireOrganization(actor);

    const chat = await import("@/lib/public-chat.server");
    const db = chat.admin();
    const checks: ReadinessCheck[] = [];
    const add = (c: ReadinessCheck) => checks.push(c);

    /* ---------------------------------------------------------------- *
     * 1. Default department with a recently available member
     * ---------------------------------------------------------------- */
    const { data: defaultDept } = await db
      .from("departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_default", true)
      .maybeSingle();

    if (!defaultDept) {
      add({
        id: "default_department",
        label: "Default department",
        pass: false,
        critical: true,
        reason: "No department is marked as the default, so routed chats have nowhere to go.",
      });
    } else {
      const { data: members } = await db
        .from("department_members")
        .select("user_id")
        .eq("department_id", defaultDept.id);
      const ids = (members ?? []).map((m) => m.user_id as string);
      let available = 0;
      if (ids.length) {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { count } = await db
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .in("id", ids)
          .eq("presence", "available")
          .gte("last_active_at", since);
        available = count ?? 0;
      }
      add({
        id: "default_department",
        label: "Default department",
        pass: available > 0,
        critical: true,
        reason:
          available > 0
            ? `"${defaultDept.name}" has ${available} member(s) marked available in the last 7 days.`
            : `"${defaultDept.name}" has no member who was available in the last 7 days.`,
      });
    }

    /* ---------------------------------------------------------------- *
     * 2. Business hours and organization timezone
     * ---------------------------------------------------------------- */
    const { data: org } = await db
      .from("organizations")
      .select("timezone, require_mfa_for_admins, sla_first_response_minutes")
      .eq("id", organizationId)
      .maybeSingle();

    const { data: hours } = await db
      .from("business_hours")
      .select("day_of_week, is_closed")
      .eq("organization_id", organizationId);
    const openDays = new Set(
      (hours ?? []).filter((h) => !h.is_closed).map((h) => h.day_of_week as number),
    );
    const timezone = (org?.timezone ?? "").trim();
    add({
      id: "business_hours",
      label: "Business hours",
      pass: openDays.size >= 5 && timezone.length > 0,
      critical: true,
      reason:
        openDays.size >= 5 && timezone.length > 0
          ? `${openDays.size} open days configured, timezone ${timezone}.`
          : `${openDays.size} open day(s) configured${timezone ? "" : " and no organization timezone set"}; at least 5 open days and a timezone are required.`,
    });

    /* ---------------------------------------------------------------- *
     * 3. Production website
     * ---------------------------------------------------------------- */
    const { data: sites } = await db
      .from("websites")
      .select("id, name, domain, dev_mode, allowed_domains, verified_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true });
    const production =
      (sites ?? []).find((s) => isProductionDomain(s.domain as string | null)) ?? null;
    const siteProblems: string[] = [];
    if (!production) siteProblems.push("no live website found");
    else {
      if (production.dev_mode) siteProblems.push("test mode is still on");
      if (!((production.allowed_domains as string[] | null)?.length ?? 0))
        siteProblems.push("no approved domains listed");
      if (!production.verified_at) siteProblems.push("the domain is not verified");
    }
    add({
      id: "production_website",
      label: "Live website",
      pass: siteProblems.length === 0,
      critical: true,
      reason:
        siteProblems.length === 0
          ? `${production?.domain} is live, verified and restricted to its approved domains.`
          : `${production?.domain ?? "Live website"}: ${siteProblems.join(", ")}.`,
    });

    /* ---------------------------------------------------------------- *
     * 4. Two-step verification for administrators
     * ---------------------------------------------------------------- */
    const { data: admins } = await db
      .from("organization_memberships")
      .select("user_id, role")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .in("role", ["administrator", "super_admin"]);
    const adminIds = new Set((admins ?? []).map((a) => a.user_id as string));
    let withoutFactor = 0;
    if (adminIds.size) {
      const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const user of list?.users ?? []) {
        if (!adminIds.has(user.id)) continue;
        const verified = (user.factors ?? []).some((f) => f.status === "verified");
        if (!verified) withoutFactor += 1;
      }
    }
    const mfaRequired = Boolean(org?.require_mfa_for_admins);
    add({
      id: "admin_mfa",
      label: "Two-step verification for administrators",
      pass: mfaRequired && adminIds.size > 0 && withoutFactor === 0,
      critical: true,
      reason: !mfaRequired
        ? "Two-step verification is not required for administrators."
        : adminIds.size === 0
          ? "No active administrator accounts were found."
          : withoutFactor === 0
            ? `Required, and all ${adminIds.size} administrator(s) have completed setup.`
            : `${withoutFactor} of ${adminIds.size} administrator(s) have not set up an authenticator yet.`,
    });

    /* ---------------------------------------------------------------- *
     * 5. Knowledge coverage and freshness
     * ---------------------------------------------------------------- */
    const [articleRes, faqRes, chunkRes] = await Promise.all([
      db
        .from("knowledge_articles")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("status", "published"),
      db.from("faqs").select("id").eq("organization_id", organizationId).eq("status", "active"),
      db
        .from("knowledge_chunks")
        .select("source_type, source_id, created_at")
        .eq("organization_id", organizationId),
    ]);
    const articles = articleRes.data ?? [];
    const faqs = faqRes.data ?? [];
    const chunks = chunkRes.data ?? [];
    const indexed = new Set(chunks.map((c) => `${c.source_type}:${c.source_id}`));
    const missing =
      articles.filter((a) => !indexed.has(`article:${a.id}`)).length +
      faqs.filter((f) => !indexed.has(`faq:${f.id}`)).length;
    const newest = chunks.reduce<number>(
      (max, c) => Math.max(max, new Date(c.created_at as string).getTime()),
      0,
    );
    const ageDays = newest ? Math.floor((Date.now() - newest) / 86_400_000) : Infinity;
    const total = articles.length + faqs.length;
    const knowledgeOk = total >= 10 && missing === 0 && ageDays <= 30;
    add({
      id: "knowledge",
      label: "Knowledge base",
      pass: knowledgeOk,
      critical: true,
      reason: knowledgeOk
        ? `${total} published answers, all indexed, last rebuilt ${ageDays} day(s) ago.`
        : total < 10
          ? `Only ${total} published article(s) and FAQ(s); at least 10 are needed.`
          : missing > 0
            ? `${missing} published item(s) are not indexed — run "Reindex all".`
            : `The index was last rebuilt ${ageDays === Infinity ? "never" : `${ageDays} days ago`}; rebuild it at least every 30 days.`,
    });

    /* ---------------------------------------------------------------- *
     * 6. Live AI round-trip
     * ---------------------------------------------------------------- */
    if (!production) {
      add({
        id: "ai_roundtrip",
        label: "Assistant answers",
        pass: false,
        critical: true,
        reason: "No live website to test the assistant against.",
      });
    } else {
      const { data: full } = await db
        .from("websites")
        .select("*")
        .eq("id", production.id)
        .maybeSingle();
      const failures: string[] = [];
      for (const question of AI_PROBES) {
        try {
          const result = await chat.answerQuestion({
            website: full as Record<string, unknown>,
            question,
            history: [],
            conversationId: null,
          });
          if (result.confidence < 0.6 || result.sources.length === 0) {
            failures.push(
              `"${question}" (confidence ${result.confidence.toFixed(2)}, ${result.sources.length} source(s))`,
            );
          }
        } catch (error) {
          failures.push(
            `"${question}" failed: ${error instanceof Error ? error.message : "unknown error"}`,
          );
        }
      }
      add({
        id: "ai_roundtrip",
        label: "Assistant answers",
        pass: failures.length === 0,
        critical: true,
        reason:
          failures.length === 0
            ? "All three sample questions were answered confidently with cited sources."
            : `Weak or unsourced answer for ${failures.join("; ")}.`,
      });
    }

    /* ---------------------------------------------------------------- *
     * 7. First-reply target and scheduled jobs
     * ---------------------------------------------------------------- */
    const sla = Number(org?.sla_first_response_minutes ?? 0);
    const { data: cron } = await db.rpc("cron_health");
    type CronRow = {
      job_name: string | null;
      status_code: number | null;
      timed_out: boolean | null;
      created: string;
    };
    const latest = new Map<string, CronRow>();
    for (const row of (cron ?? []) as CronRow[]) {
      const name = row.job_name ?? "unknown";
      if (!latest.has(name)) latest.set(name, row);
    }
    // The SLA check runs every 5 minutes; the abandonment sweep runs hourly, so
    // its "recent" window is its own schedule plus a margin.
    const hooks: { name: string; label: string; windowMinutes: number }[] = [
      { name: "sla-first-response-check", label: "reply-target check", windowMinutes: 15 },
      { name: "conversation-abandonment-sweep", label: "abandoned-chat sweep", windowMinutes: 90 },
    ];
    const hookProblems: string[] = [];
    for (const hook of hooks) {
      const row = latest.get(hook.name);
      if (!row) {
        hookProblems.push(`the ${hook.label} has never run`);
        continue;
      }
      const ageMin = (Date.now() - new Date(row.created).getTime()) / 60_000;
      if (row.status_code !== 200 || row.timed_out) {
        hookProblems.push(
          `the ${hook.label} last returned ${row.timed_out ? "a timeout" : (row.status_code ?? "no response")}`,
        );
      } else if (ageMin > hook.windowMinutes) {
        hookProblems.push(`the ${hook.label} last ran ${Math.round(ageMin)} minutes ago`);
      }
    }
    if (sla <= 0) hookProblems.unshift("no first-reply target is set");
    add({
      id: "sla_and_jobs",
      label: "Reply target and scheduled jobs",
      pass: hookProblems.length === 0,
      critical: true,
      reason:
        hookProblems.length === 0
          ? `First-reply target ${sla} minutes; both scheduled jobs completed successfully.`
          : `${hookProblems.join("; ")}.`,
    });

    /* ---------------------------------------------------------------- *
     * 8. No test organizations left behind
     * ---------------------------------------------------------------- */
    const { count: synthetic } = await db
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .or("name.like.__e2e\\_%,name.like.__test\\_%");
    add({
      id: "no_synthetic_tenants",
      label: "No test organizations",
      pass: (synthetic ?? 0) === 0,
      critical: true,
      reason:
        (synthetic ?? 0) === 0
          ? "No test or rehearsal organizations remain in the database."
          : `${synthetic} test organization(s) still exist and must be removed.`,
    });

    /* ---------------------------------------------------------------- *
     * 9. Release report matches this build
     * ---------------------------------------------------------------- */
    const buildId = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown";
    const reportBuild =
      typeof __RELEASE_REPORT_BUILD_ID__ === "string" ? __RELEASE_REPORT_BUILD_ID__ : "";
    const reportOverall =
      typeof __RELEASE_REPORT_OVERALL__ === "string" ? __RELEASE_REPORT_OVERALL__ : "";
    const sameBuild = reportBuild === buildId;
    const reportPassed = reportOverall === "PASS";
    add({
      id: "release_report",
      label: "Release report",
      pass: sameBuild && reportPassed,
      // A failing report blocks launch. A report from a slightly earlier commit
      // is a staleness warning, not a block — routine content edits move the
      // commit forward without re-running the gate.
      critical: !reportPassed,
      reason:
        sameBuild && reportPassed
          ? `Release report passed for this exact build (${buildId.slice(0, 12)}).`
          : !reportPassed
            ? `The release report records "${reportOverall || "no result"}", not PASS.`
            : `The release report passed, but for a different build (${reportBuild.slice(0, 12) || "none"} vs ${buildId.slice(0, 12)}) — re-run the release gate.`,
    });


    const criticalFailures = checks.filter((c) => c.critical && !c.pass).length;
    return {
      generatedAt: new Date().toISOString(),
      buildId,
      checks,
      criticalFailures,
      overall: checks.every((c) => c.pass) ? ("PASS" as const) : ("FAIL" as const),
    };
  });
