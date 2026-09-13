/**
 * Staff profile photos for logged-in users.
 *
 * The `staff-avatars` bucket is private. Visitors only ever see a photo through
 * the public proxy, and only for staff who opted into the widget team list.
 * Colleagues inside the console get a short-lived signed URL instead, so a
 * photo is visible to the team without being public.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ForbiddenError, requireOrganization, resolveActor } from "@/lib/authz.server";
import { MAX_AVATAR_BYTES, avatarObjectPath, sniffImage } from "@/lib/image-bytes";

const SIGNED_URL_SECONDS = 60 * 60;

/** Signed URL for a colleague's photo. Any active member of the same org may ask. */
export const staffAvatarUrlFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    const organizationId = requireOrganization(actor);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, organization_id, avatar_url")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target) return { url: null as string | null };
    if (target.organization_id !== organizationId && !actor.isPlatformAdmin) {
      throw new ForbiddenError("That person belongs to another organization");
    }

    const path = avatarObjectPath(target.avatar_url);
    if (!path) return { url: null as string | null };

    const { data: signed, error } = await supabaseAdmin.storage
      .from("staff-avatars")
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !signed?.signedUrl) return { url: null as string | null };
    return { url: signed.signedUrl };
  });

/** Upload the caller's own photo. Bytes are sniffed server-side; only PNG/JPG pass. */
export const uploadStaffAvatarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ base64: z.string().min(16).max(9_000_000) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requireOrganization(actor);

    const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (binary.byteLength > MAX_AVATAR_BYTES) throw new Error("Photos must be under 5 MB.");
    const kind = sniffImage(binary);
    if (!kind) throw new Error("Please choose a PNG or JPG photo.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${actor.userId}/avatar-${Date.now()}.${kind.ext}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("staff-avatars")
      .upload(path, binary, { contentType: kind.type, cacheControl: "300", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    // Remove whatever was there before so the bucket does not grow forever.
    const { data: current } = await supabaseAdmin
      .from("profiles")
      .select("avatar_url")
      .eq("id", actor.userId)
      .maybeSingle();
    const previous = avatarObjectPath(current?.avatar_url);
    if (previous && previous !== path) {
      await supabaseAdmin.storage.from("staff-avatars").remove([previous]);
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: path })
      .eq("id", actor.userId);
    if (error) throw new Error(error.message);

    const { data: signed } = await supabaseAdmin.storage
      .from("staff-avatars")
      .createSignedUrl(path, SIGNED_URL_SECONDS);
    return { ok: true, path, url: signed?.signedUrl ?? null };
  });

/** Delete the caller's photo object and clear the column. */
export const removeStaffAvatarFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveActor(context.supabase, context.userId, context.claims);
    requireOrganization(actor);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current } = await supabaseAdmin
      .from("profiles")
      .select("avatar_url")
      .eq("id", actor.userId)
      .maybeSingle();
    const path = avatarObjectPath(current?.avatar_url);
    if (path) await supabaseAdmin.storage.from("staff-avatars").remove([path]);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", actor.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
