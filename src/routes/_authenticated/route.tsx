import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Being signed in is not the same as belonging to a tenant. Social sign-in
    // creates an account with no organization; access requires an active
    // membership granted through an administrator invitation.
    const [{ data: membership }, { data: platform }] = await Promise.all([
      supabase
        .from("organization_memberships")
        .select("organization_id")
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
      supabase.from("platform_admins").select("user_id").eq("user_id", data.user.id).maybeSingle(),
    ]);

    if (!membership && !platform) throw redirect({ to: "/no-access" });

    // MFA enforcement. Supabase reports a pending step-up whenever the account
    // has a verified factor (nextLevel aal2, currentLevel aal1); organizations
    // can additionally require a factor to exist at all.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      if (aal?.nextLevel === "aal2") throw redirect({ to: "/mfa" });
      const { data: required } = await supabase.rpc("my_mfa_requirement");
      if (required === true) throw redirect({ to: "/mfa" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
