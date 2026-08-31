import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/no-access")({
  head: () => ({
    meta: [
      { title: "No workspace access — Care Connect" },
      {
        name: "description",
        content:
          "Your Care Connect account is not yet a member of an organization. Ask an administrator for an invitation.",
      },
      { property: "og:title", content: "No workspace access — Care Connect" },
      {
        property: "og:description",
        content: "Ask an administrator to invite you to a Care Connect workspace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NoAccessPage,
});

function NoAccessPage() {
  const navigate = useNavigate();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-card-foreground">You don't have workspace access</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Your sign-in worked, but your account isn't a member of any organization yet. Access is
          granted only through an administrator invitation — signing in with Google or Microsoft
          does not join you to a workspace automatically.
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          If you were sent an invitation link, open it again to finish joining.
        </p>
        <Button
          variant="outline"
          className="mt-6 w-full"
          onClick={async () => {
            await supabase.auth.signOut();
            void navigate({ to: "/auth" });
          }}
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}
