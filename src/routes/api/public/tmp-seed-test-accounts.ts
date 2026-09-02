/**
 * TEMPORARY: provisions fictional test accounts for screenshot/QA work.
 * Guarded by a shared token. Delete this file once the accounts are created.
 */
import { createFileRoute } from "@tanstack/react-router";

const ORG_ID = "11111111-1111-1111-1111-111111111111";

const ACCOUNTS = [
  { email: "test.standard@careconnect-demo.test", name: "Casey Rivera", role: "agent", title: "Standard User" },
  { email: "test.teamlead@careconnect-demo.test", name: "Jordan Blake", role: "team_lead", title: "Team Lead" },
  { email: "test.manager@careconnect-demo.test", name: "Morgan Ellis", role: "manager", title: "Manager" },
  { email: "test.admin@careconnect-demo.test", name: "Avery Quinn", role: "administrator", title: "Administrator" },
  { email: "test.superadmin@careconnect-demo.test", name: "Riley Hart", role: "super_admin", title: "Super Admin" },
  { email: "test.platformowner@careconnect-demo.test", name: "Sam Okoye", role: "super_admin", title: "Platform Owner", platform: "platform_owner" },
] as const;

export const Route = createFileRoute("/api/public/tmp-seed-test-accounts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-seed-token");
        if (!token || token !== process.env["TMP_SEED_TOKEN"]) {
          return new Response("Unauthorized", { status: 401 });
        }
        const body = (await request.json().catch(() => ({}))) as { password?: string; mode?: string };
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const results: unknown[] = [];

        for (const acct of ACCOUNTS) {
          const { data: existingProfile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("email", acct.email)
            .maybeSingle();

          if (body.mode === "delete") {
            if (existingProfile) {
              await supabaseAdmin.from("platform_admins").delete().eq("user_id", existingProfile.id);
              await supabaseAdmin.from("organization_memberships").delete().eq("user_id", existingProfile.id);
              await supabaseAdmin.from("user_roles").delete().eq("user_id", existingProfile.id);
              await supabaseAdmin.from("department_members").delete().eq("user_id", existingProfile.id);
              await supabaseAdmin.from("profiles").delete().eq("id", existingProfile.id);
              await supabaseAdmin.auth.admin.deleteUser(existingProfile.id);
            }
            results.push({ email: acct.email, deleted: true });
            continue;
          }

          let userId = existingProfile?.id ?? null;
          if (userId) {
            await supabaseAdmin.auth.admin.updateUserById(userId, {
              password: body.password!,
              ban_duration: "none",
            });
          } else {
            const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
              email: acct.email,
              password: body.password!,
              email_confirm: true,
              user_metadata: { full_name: acct.name },
            });
            if (error || !created.user) {
              results.push({ email: acct.email, error: error?.message });
              continue;
            }
            userId = created.user.id;
          }

          await supabaseAdmin.from("profiles").upsert(
            {
              id: userId,
              organization_id: ORG_ID,
              full_name: acct.name,
              email: acct.email,
              title: acct.title,
              status: "active",
              show_in_widget_team: false,
            },
            { onConflict: "id" },
          );
          await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
          await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: userId, role: acct.role, organization_id: ORG_ID });
          await supabaseAdmin.from("organization_memberships").upsert(
            {
              organization_id: ORG_ID,
              user_id: userId,
              role: acct.role,
              status: "active",
              title: acct.title,
              accepted_at: new Date().toISOString(),
            },
            { onConflict: "organization_id,user_id" },
          );
          if ("platform" in acct && acct.platform) {
            await supabaseAdmin
              .from("platform_admins")
              .upsert({ user_id: userId, role: acct.platform }, { onConflict: "user_id" });
          }
          results.push({ email: acct.email, userId, role: acct.role });
        }

        return Response.json({ ok: true, results });
      },
    },
  },
});
