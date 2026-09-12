/**
 * Routing-rule and saved-reply writes.
 *
 * Both decide what visitors get shown or where their chat lands, so the
 * browser is read-only on these tables and changes run here behind
 * `workflow.manage` with an audit row.
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

type Ctx = { supabase: Parameters<typeof resolveActor>[0]; userId: string };

async function authorize(context: Ctx): Promise<{ actor: Actor; organizationId: string }> {
  const actor = await resolveActor(context.supabase, context.userId, context.claims);
  requirePermission(
    actor,
    "workflow.manage",
    "Only managers and above can change routing and templates",
  );
  return { actor, organizationId: requireOrganization(actor) };
}

const ruleInput = z.object({
  action: z.enum(["create", "update", "delete"]),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  matchType: z.enum(["interest", "keyword", "county", "menu_option", "language"]).optional(),
  matchValue: z.string().trim().min(1).max(200).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(0).max(10000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const manageRoutingRuleFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ruleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { actor, organizationId } = await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "create") {
      if (!data.name || !data.matchValue)
        throw new Error("Give the rule a name and a value to match");
      const { data: created, error } = await supabaseAdmin
        .from("routing_rules")
        .insert({
          organization_id: organizationId,
          name: data.name,
          match_type: data.matchType ?? "interest",
          match_value: data.matchValue,
          department_id: data.departmentId ?? null,
          priority: data.priority ?? 100,
          routing_method: "first_available",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId,
        action: "routing_rule.created",
        recordType: "routing_rules",
        recordId: created.id,
        newValue: { name: data.name, match_type: data.matchType, match_value: data.matchValue },
      });
      return { ok: true, id: created.id };
    }

    if (!data.id) throw new Error("Missing rule");
    const { data: rule } = await supabaseAdmin
      .from("routing_rules")
      .select("id, organization_id, name, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!rule || (rule.organization_id !== organizationId && !actor.isPlatformAdmin)) {
      throw new ForbiddenError("That rule belongs to another organization");
    }

    if (data.action === "delete") {
      const { error } = await supabaseAdmin.from("routing_rules").delete().eq("id", rule.id);
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId: rule.organization_id,
        action: "routing_rule.deleted",
        recordType: "routing_rules",
        recordId: rule.id,
        previousValue: { name: rule.name },
      });
      return { ok: true };
    }

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.matchType !== undefined) patch["match_type"] = data.matchType;
    if (data.matchValue !== undefined) patch["match_value"] = data.matchValue;
    if (data.departmentId !== undefined) patch["department_id"] = data.departmentId;
    if (data.priority !== undefined) patch["priority"] = data.priority;
    if (data.status !== undefined) patch["status"] = data.status;
    if (Object.keys(patch).length === 0) return { ok: true };

    const { error } = await supabaseAdmin
      .from("routing_rules")
      .update(patch as never)
      .eq("id", rule.id);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: rule.organization_id,
      action: "routing_rule.updated",
      recordType: "routing_rules",
      recordId: rule.id,
      previousValue: { status: rule.status },
      newValue: patch,
    });
    return { ok: true };
  });

const templateInput = z.object({
  action: z.enum(["create", "update", "delete"]),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  shortcut: z.string().trim().max(60).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  body: z.string().trim().min(1).max(8000).optional(),
  approved: z.boolean().optional(),
});

export const manageResponseTemplateFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => templateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { actor, organizationId } = await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "create") {
      if (!data.name || !data.body) throw new Error("Give the template a name and a message");
      const { data: created, error } = await supabaseAdmin
        .from("response_templates")
        .insert({
          organization_id: organizationId,
          name: data.name,
          shortcut: data.shortcut || null,
          category: data.category || null,
          body: data.body,
          language: "en",
          created_by: actor.userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId,
        action: "response_template.created",
        recordType: "response_templates",
        recordId: created.id,
        newValue: { name: data.name, shortcut: data.shortcut ?? null },
      });
      return { ok: true, id: created.id };
    }

    if (!data.id) throw new Error("Missing template");
    const { data: tpl } = await supabaseAdmin
      .from("response_templates")
      .select("id, organization_id, name, approved")
      .eq("id", data.id)
      .maybeSingle();
    if (!tpl || (tpl.organization_id !== organizationId && !actor.isPlatformAdmin)) {
      throw new ForbiddenError("That template belongs to another organization");
    }

    if (data.action === "delete") {
      const { error } = await supabaseAdmin.from("response_templates").delete().eq("id", tpl.id);
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId: tpl.organization_id,
        action: "response_template.deleted",
        recordType: "response_templates",
        recordId: tpl.id,
        previousValue: { name: tpl.name },
      });
      return { ok: true };
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch["name"] = data.name;
    if (data.shortcut !== undefined) patch["shortcut"] = data.shortcut || null;
    if (data.category !== undefined) patch["category"] = data.category || null;
    if (data.body !== undefined) patch["body"] = data.body;
    if (data.approved !== undefined) patch["approved"] = data.approved;

    const { error } = await supabaseAdmin
      .from("response_templates")
      .update(patch as never)
      .eq("id", tpl.id);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: tpl.organization_id,
      action: "response_template.updated",
      recordType: "response_templates",
      recordId: tpl.id,
      previousValue: { approved: tpl.approved },
      newValue: patch,
    });
    return { ok: true };
  });

/**
 * Resolution outcomes ("dispositions") an agent picks when closing a chat.
 * Managers curate the list; agents only choose from it.
 */
const dispositionInput = z.object({
  action: z.enum(["create", "rename", "activate", "deactivate"]),
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1).max(80).optional(),
});

export const manageDispositionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dispositionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { actor, organizationId } = await authorize(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.action === "create") {
      if (!data.label) throw new Error("Give the outcome a name");
      const { data: created, error } = await supabaseAdmin
        .from("conversation_dispositions")
        .insert({ organization_id: organizationId, label: data.label, is_active: true })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await writeAudit(supabaseAdmin, {
        actor,
        organizationId,
        action: "disposition.created",
        recordType: "conversation_dispositions",
        recordId: created.id,
        newValue: { label: data.label },
      });
      return { ok: true, id: created.id };
    }

    if (!data.id) throw new Error("Missing outcome");
    const { data: row } = await supabaseAdmin
      .from("conversation_dispositions")
      .select("id, organization_id, label, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || (row.organization_id !== organizationId && !actor.isPlatformAdmin)) {
      throw new ForbiddenError("Outcome not found in your organization");
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.action === "rename") {
      if (!data.label) throw new Error("Give the outcome a name");
      patch["label"] = data.label;
    } else {
      patch["is_active"] = data.action === "activate";
    }

    const { error } = await supabaseAdmin
      .from("conversation_dispositions")
      .update(patch as never)
      .eq("id", row.id);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: row.organization_id,
      action: `disposition.${data.action === "rename" ? "renamed" : data.action === "activate" ? "activated" : "deactivated"}`,
      recordType: "conversation_dispositions",
      recordId: row.id,
      previousValue: { label: row.label, is_active: row.is_active },
      newValue: patch,
    });
    return { ok: true };
  });
