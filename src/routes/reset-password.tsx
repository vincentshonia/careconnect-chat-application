import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset Password — Pacific Health Group Support Console" },
      {
        name: "description",
        content: "Set a new password for your Pacific Health Group support console staff account.",
      },
      { property: "og:title", content: "Reset Password — Pacific Health Group" },
      {
        property: "og:description",
        content: "Choose a new password for your Pacific Health Group staff account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  /** "recovery" = arrived from an email link; "signed-in" = must re-enter the current password. */
  const [mode, setMode] = useState<"none" | "recovery" | "signed-in">("none");
  const [email, setEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Supabase puts a recovery session in the URL hash; wait for it to hydrate.
  // An ordinary signed-in session is NOT proof the person owns the account, so
  // it only unlocks the form once they re-enter their current password.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        setEmail(session?.user.email ?? null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setEmail(data.session.user.email ?? null);
        setMode((current) => (current === "recovery" ? current : "signed-in"));
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "signed-in") {
        if (!email) throw new Error("Sign in again to change your password.");
        const { error: reauth } = await supabase.auth.signInWithPassword({
          email,
          password: currentPassword,
        });
        if (reauth) throw new Error("Your current password is not correct.");
      }
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;

      // Re-check the two-step requirement before returning to the console.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      setDone(true);
      const target = aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2" ? "/mfa" : "/inbox";
      setTimeout(() => navigate({ to: target, replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  }

  const ready = mode !== "none";


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            PH
          </span>
          <div>
            <p className="text-sm font-semibold">Pacific Health Group</p>
            <p className="text-xs text-muted-foreground">Support console</p>
          </div>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>

        {done ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Password updated. Taking you to the console…
          </p>
        ) : !ready ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Open this page from the reset link in your email to continue.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Saving…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
