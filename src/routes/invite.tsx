import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { acceptInvitationFn } from "@/lib/invitations.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/invite")({
  head: () => ({
    meta: [
      { title: "Accept your Care Connect invitation" },
      {
        name: "description",
        content:
          "Redeem your single-use Care Connect staff invitation to join your organization's workspace.",
      },
      { property: "og:title", content: "Accept your Care Connect invitation" },
      {
        property: "og:description",
        content: "Redeem your single-use Care Connect staff invitation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

function InvitePage() {
  const navigate = useNavigate();
  const accept = useServerFn(acceptInvitationFn);
  const [state, setState] = useState<"checking" | "ready" | "working" | "error" | "done">(
    "checking",
  );
  const [message, setMessage] = useState("");
  const token =
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("t") ?? "";

  useEffect(() => {
    (async () => {
      if (!token) {
        setState("error");
        setMessage("This invitation link is incomplete.");
        return;
      }
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        void navigate({ to: "/auth", search: { redirect: `/invite?t=${token}` } as never });
        return;
      }
      setState("ready");
    })();
  }, [token, navigate]);

  async function redeem() {
    setState("working");
    try {
      await accept({ data: { token } });
      setState("done");
      setTimeout(() => void navigate({ to: "/dashboard" }), 900);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "This invitation could not be accepted.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-card-foreground">Join your team</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Invitations are single use, expire automatically, and only work for the email address
          they were sent to.
        </p>

        {state === "error" && (
          <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{message}</p>
        )}
        {state === "done" && (
          <p className="mt-4 rounded-lg bg-accent/40 p-3 text-sm">
            You're in — taking you to your dashboard.
          </p>
        )}

        <Button
          className="mt-6 w-full"
          disabled={state !== "ready"}
          onClick={() => void redeem()}
        >
          {state === "working" ? "Accepting…" : "Accept invitation"}
        </Button>
      </div>
    </main>
  );
}
