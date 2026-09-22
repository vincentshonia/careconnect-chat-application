/**
 * Admin-facing RingCentral wiring: list the channels the connected RingCentral
 * app can post into, and map a department to one of them.
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

async function authorize(context: Ctx): Promise<{ actor: Actor; organizationId: string }> {
  const actor = await resolveActor(context.supabase, context.userId, context.claims);
  requirePermission(actor, "department.manage", "Only administrators can change departments");
  return { actor, organizationId: requireOrganization(actor) };
}

/** Connection status plus the channels available for mapping. */
export const ringCentralChatsFn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { organizationId } = await authorize(context as Ctx);
    const { isRingCentralConfigured, listChats, botStatus, fetchChat } = await import(
      "@/lib/ringcentral.server"
    );
    const bot = await botStatus();
    const configured = isRingCentralConfigured() || bot.connected;
    if (!configured) {
      return {
        connected: false as const,
        chats: [] as Array<{ id: string; name: string }>,
        unlisted: [] as Array<{ id: string; name: string }>,
        bot,
      };
    }
    const chats = await listChats();

    // Saved mappings the alert identity cannot see: resolve the real name so the
    // picker can warn instead of showing "Unknown channel".
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: depts } = await supabaseAdmin
      .from("departments")
      .select("ringcentral_chat_id")
      .eq("organization_id", organizationId)
      .not("ringcentral_chat_id", "is", null);
    const known = new Set(chats.map((c) => c.id));
    const missing = [
      ...new Set((depts ?? []).map((d) => d.ringcentral_chat_id!).filter((id) => !known.has(id))),
    ];
    const unlisted: Array<{ id: string; name: string }> = [];
    for (const id of missing.slice(0, 20)) {
      const chat = await fetchChat(id);
      unlisted.push({ id, name: chat?.name ?? `Channel ${id}` });
    }

    return { connected: true as const, chats, unlisted, bot };
  });


const mapInput = z.object({
  departmentId: z.string().uuid(),
  /** Empty string clears the mapping. */
  chatId: z.string().trim().max(120).nullable(),
});

export const setDepartmentChatFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => mapInput.parse(input))
  .handler(async ({ data, context }) => {
    const { actor, organizationId } = await authorize(context as Ctx);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: dept } = await supabaseAdmin
      .from("departments")
      .select("id, organization_id, name, ringcentral_chat_id")
      .eq("id", data.departmentId)
      .maybeSingle();
    if (!dept || (dept.organization_id !== organizationId && !actor.isPlatformAdmin)) {
      throw new ForbiddenError("That department belongs to another organization");
    }

    const chatId = data.chatId && data.chatId.length > 0 ? data.chatId : null;
    const { error } = await supabaseAdmin
      .from("departments")
      .update({ ringcentral_chat_id: chatId })
      .eq("id", dept.id);
    if (error) throw new Error(error.message);

    await writeAudit(supabaseAdmin, {
      actor,
      organizationId: dept.organization_id,
      action: "department.ringcentral_channel_changed",
      recordType: "departments",
      recordId: dept.id,
      previousValue: { ringcentral_chat_id: dept.ringcentral_chat_id },
      newValue: { ringcentral_chat_id: chatId },
    });
    return { ok: true };
  });
