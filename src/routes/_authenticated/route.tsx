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

    return { user: data.user };
  },
  component: () => <Outlet />,
});
