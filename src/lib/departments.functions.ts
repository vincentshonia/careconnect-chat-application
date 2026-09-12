/**
 * Department, coverage-window and holiday writes.
 *
 * These shape how escalations are routed, so the browser is read-only on the
 * underlying tables and every change runs here behind `department.manage`
 * with an audit row.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  ForbiddenError,
  requireOrganization,
  requirePermission,
  resolveActor,
  writeAudit,
  type Actor,
} from "@/lib/authz.server";

type Ctx = {
  supabase: Parameters<typeof resolveActor>[0];
  userId: string;
  claims?: Parameters<typeof resolveActor>[2];
};

/** Resolve the caller and confirm they may administer departments. */
async function authorize(context: Ctx): Promise<{ actor: Actor; organizationId: string }> {
  const actor = await resolveActor(context.supabase, context.userId, context.claims);
  requirePermission(actor, "department.manage", "Only administrators can change departments");
  return { actor, organizationId: requireOrganization(actor) };
}

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use a 24-hour time such as 09:00");

const departmentInput = z.object({
  action: z.enum(["create", "update", "set_default", "delete"]),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  routingMethod: z.enum(["first_available", "round_robin"]).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const manageDepartmentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => departmentInput.parse(input))
  .handler(async ({ data, context }) => {
    const { actor, organizationId } = await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "create") {
      if (!data.name) throw new Error("Give the department a name");
      const { data: created, error } = await supabaseAdmin
        .from("departments")
        .insert({
          organization_id: organizationId,
          name: data.name,
          routing_method: data.routingMethod ?? "first_available",
          timezone: "America/Los_Angeles",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId,
        action: "department.created",
        recordType: "departments",
        recordId: created.id,
        newValue: { name: data.name },
      });
      return { ok: true, id: created.id };
    }

    if (!data.id) throw new Error("Missing department");
    const { data: dept } = await supabaseAdmin
      .from("departments")
      .select("id, organization_id, name, routing_method, status, is_default")
      .eq("id", data.id)
      .maybeSingle();
    if (!dept || (dept.organization_id !== organizationId && !actor.isPlatformAdmin)) {
      throw new ForbiddenError("That department belongs to another organization");
    }

    if (data.action === "delete") {
      const { error } = await supabaseAdmin.from("departments").delete().eq("id", dept.id);
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId: dept.organization_id,
        action: "department.deleted",
        recordType: "departments",
        recordId: dept.id,
        previousValue: { name: dept.name, routing_method: dept.routing_method },
      });
      return { ok: true };
    }

    if (data.action === "set_default") {
      await supabaseAdmin
        .from("departments")
        .update({ is_default: false })
        .eq("organization_id", dept.organization_id)
        .neq("id", dept.id);
      const { error } = await supabaseAdmin
        .from("departments")
        .update({ is_default: true })
        .eq("id", dept.id);
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId: dept.organization_id,
        action: "department.default_changed",
        recordType: "departments",
        recordId: dept.id,
        newValue: { name: dept.name, is_default: true },
      });
      return { ok: true };
    }

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.routingMethod !== undefined) patch["routing_method"] = data.routingMethod;
    if (data.status !== undefined) patch["status"] = data.status;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabaseAdmin
      .from("departments")
      .update(patch as never)
      .eq("id", dept.id);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: dept.organization_id,
      action: "department.updated",
      recordType: "departments",
      recordId: dept.id,
      previousValue: { name: dept.name, routing_method: dept.routing_method, status: dept.status },
      newValue: patch,
    });
    return { ok: true };
  });

const hoursInput = z.object({
  id: z.string().uuid().optional(),
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: time,
  closeTime: time,
  isClosed: z.boolean(),
});

export const saveBusinessHoursFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => hoursInput.parse(input))
  .handler(async ({ data, context }) => {
    const { actor, organizationId } = await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.id) {
      const { data: row } = await supabaseAdmin
        .from("business_hours")
        .select("id, organization_id")
        .eq("id", data.id)
        .maybeSingle();
      if (!row || (row.organization_id !== organizationId && !actor.isPlatformAdmin)) {
        throw new ForbiddenError("Those hours belong to another organization");
      }
      const { error } = await supabaseAdmin
        .from("business_hours")
        .update({ open_time: data.openTime, close_time: data.closeTime, is_closed: data.isClosed })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("business_hours").insert({
        organization_id: organizationId,
        day_of_week: data.dayOfWeek,
        open_time: data.openTime,
        close_time: data.closeTime,
        is_closed: data.isClosed,
      });
      if (error) throw new Error(error.message);
    }

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId,
      action: data.id ? "business_hours.updated" : "business_hours.created",
      recordType: "business_hours",
      recordId: data.id ?? null,
      newValue: {
        day_of_week: data.dayOfWeek,
        open_time: data.openTime,
        close_time: data.closeTime,
        is_closed: data.isClosed,
      },
    });
    return { ok: true };
  });

const holidayInput = z.object({
  action: z.enum(["create", "delete"]),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const manageHolidayFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => holidayInput.parse(input))
  .handler(async ({ data, context }) => {
    const { actor, organizationId } = await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "create") {
      if (!data.name || !data.date) throw new Error("Give the closure a name and a date");
      const { error } = await supabaseAdmin
        .from("holidays")
        .insert({ organization_id: organizationId, name: data.name, holiday_date: data.date });
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId,
        action: "holiday.created",
        recordType: "holidays",
        newValue: { name: data.name, date: data.date },
      });
      return { ok: true };
    }

    if (!data.id) throw new Error("Missing holiday");
    const { data: row } = await supabaseAdmin
      .from("holidays")
      .select("id, organization_id, name")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || (row.organization_id !== organizationId && !actor.isPlatformAdmin)) {
      throw new ForbiddenError("That closure belongs to another organization");
    }
    const { error } = await supabaseAdmin.from("holidays").delete().eq("id", row.id);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: row.organization_id,
      action: "holiday.deleted",
      recordType: "holidays",
      recordId: row.id,
      previousValue: { name: row.name },
    });
    return { ok: true };
  });

const memberInput = z.object({
  userId: z.string().uuid(),
  departmentId: z.string().uuid(),
  member: z.boolean(),
});

/** Add or remove somebody from a department's routing pool. */
export const setDepartmentMemberFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memberInput.parse(input))
  .handler(async ({ data, context }) => {
    const { actor, organizationId } = await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: dept }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("departments")
        .select("id, organization_id, name")
        .eq("id", data.departmentId)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("id, organization_id")
        .eq("id", data.userId)
        .maybeSingle(),
    ]);
    if (!dept || dept.organization_id !== organizationId) {
      throw new ForbiddenError("That department belongs to another organization");
    }
    if (!profile || profile.organization_id !== organizationId) {
      throw new ForbiddenError("That staff member is not in your organization");
    }

    if (data.member) {
      const { error } = await supabaseAdmin.from("department_members").insert({
        user_id: data.userId,
        department_id: data.departmentId,
        organization_id: organizationId,
      });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("department_members")
        .delete()
        .eq("user_id", data.userId)
        .eq("department_id", data.departmentId);
      if (error) throw new Error(error.message);
    }

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId,
      action: data.member ? "department_member.added" : "department_member.removed",
      recordType: "department_members",
      recordId: data.userId,
      newValue: { departmentId: data.departmentId, department: dept.name },
    });
    return { ok: true };
  });
