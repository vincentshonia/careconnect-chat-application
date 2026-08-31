import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Lock, Mail, ShieldCheck, HeartPulse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff Sign In — Pacific Health Group Support Console" },
      {
        name: "description",
        content:
          "Sign in to the Pacific Health Group support console to manage conversations, knowledge, and widget settings.",
      },
      { property: "og:title", content: "Staff Sign In — Pacific Health Group" },
      { property: "og:description", content: "Support console access for Pacific Health Group staff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  // Staff accounts are created by administrators — this page only signs in
  // existing users or emails them a password reset link.
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/inbox", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
        navigate({ to: "/inbox", replace: true });
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err) throw err;
        setMessage(
          "If that email belongs to a staff account, a password reset link is on its way.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-sidebar px-14 py-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(80% 60% at 0% 0%, color-mix(in oklab, var(--brand-from) 45%, transparent), transparent 65%), radial-gradient(70% 70% at 100% 100%, color-mix(in oklab, var(--brand-via) 45%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sidebar-accent text-sm font-bold text-sidebar-accent-foreground">
            PH
          </span>
          <div className="leading-tight">
            <p className="font-display text-lg font-semibold">Pacific</p>
            <p className="text-[0.62rem] uppercase tracking-[0.32em] text-sidebar-foreground/70">
              Health Group
            </p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h2 className="font-display text-5xl font-bold leading-[1.08] tracking-tight">
            Your members are one chat away!
          </h2>
          <p className="mt-6 text-base leading-relaxed text-sidebar-foreground/75">
            Care Connect OS brings your website prospects under one roof — So every conversation
            does not get missed.
          </p>

          <div className="mt-10 flex items-center gap-4 rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/40 p-4 backdrop-blur-sm">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
              <HeartPulse className="h-5 w-5" />
            </span>
            <div className="text-sm">
              <p className="font-semibold text-white">Built with love. Focused on retention.&nbsp;</p>
              <p className="text-xs text-sidebar-foreground/65">
                Secure · HIPAA-aware · Internal use only
              </p>
            </div>
          </div>
        </div>

        <div className="relative h-1 w-32 rounded-full bg-gradient-to-r from-[var(--brand-from)] via-[var(--brand-via)] to-[var(--brand-to)]" />
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">
              PH
            </span>
            <div>
              <p className="text-sm font-semibold">Pacific Health Group</p>
              <p className="text-xs text-muted-foreground">Support console</p>
            </div>
          </div>

          <h1 className="font-display text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Sign in to Care Connect" : "Reset your password"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Log in to your account"
              : "Enter your work email and we'll send you a link to set a new password."}
          </p>

          {mode === "signin" ? (
            <div className="mt-8 space-y-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-3 text-sm font-semibold"
                disabled={busy}
                onClick={() => oauth("google")}
              >
                <GoogleMark />
                Continue with Google
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full gap-3 text-sm font-semibold"
                disabled={busy}
                onClick={() => oauth("microsoft")}
              >
                <MicrosoftMark />
                Continue with Microsoft
              </Button>

              <div className="flex items-center gap-3 pt-2">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  or with email
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          ) : null}

          <form onSubmit={submit} className="mt-6 space-y-4">

            <div className="space-y-2">
              <Label htmlFor="email" className="sr-only">
                Work email
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@mypacifichealth.com"
                  className="h-11 pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {mode === "signin" ? (
              <div className="space-y-2">
                <Label htmlFor="password" className="sr-only">
                  Password
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Password"
                    className="h-11 pl-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="current-password"
                  />
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

            <Button type="submit" className="h-11 w-full gap-2 text-sm font-semibold" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Send reset link"}
              {!busy ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </form>

          <div className="mt-8 border-t border-border pt-6">
            <div className="flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {mode === "signin" ? "Forgot your password?" : "Remembered your password?"}
                </p>
                <p className="mt-1">
                  {mode === "signin"
                    ? "We'll email a secure reset link to your work address. The link expires in 60 minutes and can only be used once — check your spam folder if it doesn't arrive within a few minutes."
                    : "Head back to the sign-in form and use your existing password. If you never received the reset email, request a new link — older links stop working once a new one is sent."}
                </p>
                <button
                  type="button"
                  className="mt-2 font-semibold text-foreground underline underline-offset-4 hover:no-underline"
                  onClick={() => {
                    setMode(mode === "signin" ? "forgot" : "signin");
                    setError(null);
                    setMessage(null);
                  }}
                >
                  {mode === "signin" ? "Send a reset link" : "Back to sign in"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
