/**
 * FAQ and service writes go through the server so every change is permission
 * checked, tenant scoped, and re-indexed for the assistant in one step.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, requireOrganization, requirePermission } from "@/lib/authz.server";
import { z } from "zod";

const faqCreate = z.object({
  category: z.string().trim().min(1).max(120).default("General"),
  question: z.string().trim().min(3).max(500),
  answer: z.string().trim().min(1).max(10_000),
});

const faqUpdate = z.object({
  id: z.string().uuid(),
  category: z.string().trim().min(1).max(120).optional(),
  question: z.string().trim().min(3).max(500).optional(),
  answer: z.string().trim().min(1).max(10_000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

const serviceCreate = z.object({
  name: z.string().trim().min(1).max(200),
  short_description: z.string().trim().min(1).max(1000),
});

const serviceUpdate = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  short_description: z.string().trim().min(1).max(1000).optional(),
  eligibility_overview: z.string().trim().max(4000).nullish(),
  status: z.enum(["active", "inactive"]).optional(),
});

/**
 * Review queue: recent AI answers that scored low or were thumbed down, grouped
 * by the question so repeated asks show up once with a count.
 */
export const aiReviewQueueFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(50).default(10),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "knowledge.edit");
    const organizationId = requireOrganization(actor);

    const { data: rows, error } = await context.supabase.rpc("ai_review_queue", {
      _org: organizationId,
      _limit: data.pageSize,
      _offset: data.page * data.pageSize,
    });
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    return {
      rows: list.map((r) => ({
        id: r.ai_response_id,
        question: r.question,
        answer: r.answer,
        confidence: r.confidence,
        feedback: r.visitor_feedback,
        occurrences: Number(r.occurrences),
        lastAskedAt: r.last_asked_at,
      })),
      total: list.length > 0 ? Number(list[0]!.total_count) : 0,
    };
  });

export const dismissAiResponseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "knowledge.edit");

    const { error } = await context.supabase
      .from("ai_responses")
      .update({ reviewed_at: new Date().toISOString(), reviewed_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { id: data.id };
  });

export const createFaqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => faqCreate.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "knowledge.edit");
    const organizationId = requireOrganization(actor);

    const { data: row, error } = await context.supabase
      .from("faqs")
      .insert({
        organization_id: organizationId,
        category: data.category,
        question: data.question,
        answer: data.answer,
        applies_to_all: true,
        status: "active" as const,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { indexFaq } = await import("@/lib/knowledge-index.server");
    const { chunks } = await indexFaq(row.id as string);
    return { id: row.id as string, chunks };
  });

export const updateFaqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => faqUpdate.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "knowledge.edit");

    const { id, ...patch } = data;
    const { error } = await context.supabase.from("faqs").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    const { indexFaq } = await import("@/lib/knowledge-index.server");
    const { chunks } = await indexFaq(id);
    return { id, chunks };
  });

export const deleteFaqFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "knowledge.edit");

    // The delete is scoped by the caller's own access rules; only clear the
    // search index when a row this caller could actually reach was removed.
    const { data: removed, error } = await context.supabase
      .from("faqs")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if ((removed ?? []).length !== 1) throw new Error("Not found");

    const { removeIndexedSource } = await import("@/lib/knowledge-index.server");
    await removeIndexedSource("faq", data.id);
    return { id: data.id };
  });

export const createServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => serviceCreate.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "knowledge.edit");
    const organizationId = requireOrganization(actor);

    const { data: row, error } = await context.supabase
      .from("services")
      .insert({
        organization_id: organizationId,
        name: data.name,
        short_description: data.short_description,
        applies_to_all: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { indexService } = await import("@/lib/knowledge-index.server");
    const { chunks } = await indexService(row.id as string);
    return { id: row.id as string, chunks };
  });

export const updateServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => serviceUpdate.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "knowledge.edit");

    const { id, ...patch } = data;
    const { error } = await context.supabase.from("services").update(patch).eq("id", id);
    if (error) throw new Error(error.message);

    const { indexService } = await import("@/lib/knowledge-index.server");
    const { chunks } = await indexService(id);
    return { id, chunks };
  });

export const deleteServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requirePermission(actor, "knowledge.edit");

    const { data: removed, error } = await context.supabase
      .from("services")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if ((removed ?? []).length !== 1) throw new Error("Not found");

    const { removeIndexedSource } = await import("@/lib/knowledge-index.server");
    await removeIndexedSource("service", data.id);
    return { id: data.id };
  });
