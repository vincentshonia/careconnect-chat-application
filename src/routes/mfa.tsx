import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Second-factor gate.
 *
 * Staff land here when their organization enforces MFA (or Supabase reports a
 * pending aal2 step) and the current session is still aal1. Users without an
 * authenticator enroll one here; users with one enter a code.
 */
export const Route = createFileRoute("/mfa")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Two-step verification — CareConnect" },
      { name: "description", content: "Confirm your identity with an authenticator code to reach the CareConnect console." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MfaGate,
});

function MfaGate() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);

  const factors = useQuery({
    queryKey: ["mfa-gate-factors"],
    queryFn: async () => {
      const { data, error: e } = await supabase.auth.mfa.listFactors();
      if (e) throw e;
      return (data?.all ?? []).filter((f) => f.status === "verified");
    },
  });

  const startEnroll = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 16)}`,
      });
      if (e) throw e;
      return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
    },
    onSuccess: (data) => {
      setEnroll(data);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not start enrollment"),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const factorId = enroll?.id ?? factors.data?.[0]?.id;
      if (!factorId) throw new Error("No authenticator is set up on this account yet.");
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      const { error: e } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (e) throw e;
    },
    onSuccess: () => navigate({ to: "/dashboard", replace: true }),
    onError: (e) => setError(e instanceof Error ? e.message : "That code was not accepted"),
  });

  const hasFactor = (factors.data?.length ?? 0) > 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ShieldCheck className="size-5" />
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Two-step verification required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {hasFactor || enroll
            ? "Enter the 6-digit code from your authenticator app to continue."
            : "Your organization requires an authenticator app before you can open the console."}
        </p>

        {!hasFactor && !enroll ? (
          <Button className="mt-6 w-full" onClick={() => startEnroll.mutate()} disabled={startEnroll.isPending}>
            {startEnroll.isPending ? "Preparing…" : "Set up authenticator app"}
          </Button>
        ) : (
          <div className="mt-6 space-y-4">
            {enroll ? (
              <div className="space-y-2">
                <img src={enroll.qr} alt="Two-factor QR code" className="h-44 w-44 rounded-lg bg-white p-2" />
                <p className="text-xs text-muted-foreground">
                  Can&apos;t scan? Enter this key manually:{" "}
                  <code className="font-mono">{enroll.secret}</code>
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Authentication code</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="font-mono tracking-widest"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => submit.mutate()}
              disabled={code.length !== 6 || submit.isPending}
            >
              {submit.isPending ? "Verifying…" : "Verify and continue"}
            </Button>
          </div>
        )}

        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}

        <button
          type="button"
          className="mt-6 text-xs text-muted-foreground underline underline-offset-4"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth", replace: true });
          }}
        >
          Sign in with a different account
        </button>
      </div>
    </main>
  );
}
