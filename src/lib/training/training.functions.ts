/**
 * Training Center persistence.
 *
 * Progress is private to the person reading the guide: the browser never sends
 * a user id, it is taken from the authenticated session. Review flags are the
 * administrator-facing counterpart — a record of when a guide was last checked
 * against the running application.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveActor, requireOrganization, requirePermission } from "@/lib/authz.server";
import { TRAINING_GUIDE_VERSION } from "./version";

const GUIDE_ROLES = [
  "agent",
  "team_lead",
  "manager",
  "administrator",
  "super_admin",
  "platform_owner",
] as const;

const guideRoleSchema = z.enum(GUIDE_ROLES);

export type TrainingReviewFlag = {
  guide_role: string;
  status: string;
  note: string | null;
  guide_version: string | null;
  reviewed_at: string | null;
  flagged_at: string | null;
};

export type TrainingState = {
  /** Completed section ids, keyed by guide role. */
  progress: Record<string, string[]>;
  reviews: TrainingReviewFlag[];
  canReview: boolean;
};

export const getTrainingStateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<TrainingState> => {
    const actor = await resolveActor(context.supabase, context.userId);
    const organizationId = requireOrganization(actor);

    const [progressRes, reviewRes] = await Promise.all([
      context.supabase
        .from("training_progress")
        .select("guide_role, section_id")
        .eq("user_id", actor.userId),
      context.supabase
        .from("training_review_flags")
        .select("guide_role, status, note, guide_version, reviewed_at, flagged_at")
        .eq("organization_id", organizationId),
    ]);

    if (progressRes.error) {
      console.error("[training] progress read failed", progressRes.error.message);
    }

    const progress: Record<string, string[]> = {};
    for (const row of progressRes.data ?? []) {
      (progress[row.guide_role] ??= []).push(row.section_id);
    }

    return {
      progress,
      reviews: (reviewRes.data ?? []) as TrainingReviewFlag[],
      canReview: actor.permissions.has("settings.manage"),
    };
  });

const setProgressSchema = z.object({
  guideRole: guideRoleSchema,
  sectionId: z.string().min(1).max(120),
  completed: z.boolean(),
});

export const setTrainingProgressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => setProgressSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const organizationId = requireOrganization(actor);

    if (data.completed) {
      const { error } = await context.supabase.from("training_progress").upsert(
        {
          organization_id: organizationId,
          user_id: actor.userId,
          guide_role: data.guideRole,
          section_id: data.sectionId,
        },
        { onConflict: "user_id,guide_role,section_id" },
      );
      if (error) {
        console.error("[training] could not save progress", error.message);
        throw new Error("Could not save your progress");
      }
    } else {
      const { error } = await context.supabase
        .from("training_progress")
        .delete()
        .eq("user_id", actor.userId)
        .eq("guide_role", data.guideRole)
        .eq("section_id", data.sectionId);
      if (error) {
        console.error("[training] could not clear progress", error.message);
        throw new Error("Could not update your progress");
      }
    }

    return { ok: true as const };
  });

export const resetTrainingProgressFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ guideRole: guideRoleSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    requireOrganization(actor);

    const { error } = await context.supabase
      .from("training_progress")
      .delete()
      .eq("user_id", actor.userId)
      .eq("guide_role", data.guideRole);
    if (error) {
      console.error("[training] could not reset progress", error.message);
      throw new Error("Could not reset your progress");
    }
    return { ok: true as const };
  });

const reviewSchema = z.object({
  guideRole: guideRoleSchema,
  status: z.enum(["reviewed", "needs_review"]),
  note: z.string().max(500).optional().nullable(),
});

/** Administrators record that a guide still matches the running application. */
export const setTrainingReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId);
    const organizationId = requireOrganization(actor);
    requirePermission(actor, "settings.manage", "Only administrators can review training content");

    const now = new Date().toISOString();
    const { error } = await context.supabase.from("training_review_flags").upsert(
      {
        organization_id: organizationId,
        guide_role: data.guideRole,
        status: data.status,
        note: data.note?.trim() || null,
        guide_version: TRAINING_GUIDE_VERSION,
        reviewed_by: data.status === "reviewed" ? actor.userId : null,
        reviewed_at: data.status === "reviewed" ? now : null,
        flagged_by: data.status === "needs_review" ? actor.userId : null,
        flagged_at: data.status === "needs_review" ? now : null,
      },
      { onConflict: "organization_id,guide_role" },
    );
    if (error) {
      console.error("[training] could not save review state", error.message);
      throw new Error("Could not update the review state");
    }

    return { ok: true as const };
  });
