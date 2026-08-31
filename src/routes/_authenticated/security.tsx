import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { AdminShell } from "@/components/admin/AdminShell";
import { MfaPolicyCard } from "@/components/admin/MfaPolicyCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/security")({
  head: () => ({
    meta: [
      { title: "Security — Pacific Health Group Support Console" },
      {
        name: "description",
        content: "Two-factor authentication, active sessions, and account security for staff accounts.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityPage,
});

type Factor = { id: string; friendly_name?: string | null; status: string; factor_type: string };

function SecurityPage() {
  const queryClient = useQueryClient();
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const factors = useQuery({
    queryKey: ["mfa-factors"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      return (data?.all ?? []) as Factor[];
    },
  });

  const verified = (factors.data ?? []).filter((f) => f.status === "verified");

  const startEnroll = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
      });
      if (error) throw error;
      return {
        id: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      };
    },
    onSuccess: (data) => {
      setEnroll(data);
      setStatus(null);
    },
    onError: (e) => setStatus(e instanceof Error ? e.message : "Could not start enrollment"),
  });

  const verify = useMutation({
    mutationFn: async () => {
      if (!enroll) return;
      const challenge = await supabase.auth.mfa.challenge({ factorId: enroll.id });
      if (challenge.error) throw challenge.error;
      const { error } = await supabase.auth.mfa.verify({
        factorId: enroll.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (error) throw error;
      await logAudit({ action: "security.mfa_enabled", recordType: "auth_factor", recordId: enroll.id });
    },
    onSuccess: () => {
      setEnroll(null);
      setCode("");
      setStatus("Two-factor authentication is now active on your account.");
      queryClient.invalidateQueries({ queryKey: ["mfa-factors"] });
    },
    onError: (e) => setStatus(e instanceof Error ? e.message : "That code was not accepted"),
  });

  const unenroll = useMutation({
    mutationFn: async (factorId: string) => {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await logAudit({ action: "security.mfa_disabled", recordType: "auth_factor", recordId: factorId });
    },
    onSuccess: () => {
      setStatus("Authenticator removed.");
      queryClient.invalidateQueries({ queryKey: ["mfa-factors"] });
    },
    onError: (e) => setStatus(e instanceof Error ? e.message : "Could not remove factor"),
  });

  return (
    <AdminShell
      title="Security"
      description="Protect your staff account with an authenticator app. Required for anyone handling protected health information."
    >
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <MfaPolicyCard />
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Two-factor authentication</h2>
            <Badge variant={verified.length ? "default" : "outline"}>
              {verified.length ? "Enabled" : "Not enabled"}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a time-based code from an authenticator app such as Google Authenticator, 1Password or Authy.
          </p>

          <ul className="mt-4 space-y-2">
            {verified.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>{f.friendly_name || "Authenticator app"}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => unenroll.mutate(f.id)}
                  disabled={unenroll.isPending}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>

          {enroll ? (
            <div className="mt-4 space-y-3">
              <img src={enroll.qr} alt="Two-factor QR code" className="h-44 w-44 rounded-lg bg-white p-2" />
              <p className="text-xs text-muted-foreground">
                Can't scan? Enter this key manually: <code className="font-mono">{enroll.secret}</code>
              </p>
              <div className="space-y-2">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-40 font-mono tracking-widest"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => verify.mutate()} disabled={code.length !== 6 || verify.isPending}>
                  {verify.isPending ? "Verifying…" : "Confirm"}
                </Button>
                <Button variant="ghost" onClick={() => setEnroll(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button className="mt-4" onClick={() => startEnroll.mutate()} disabled={startEnroll.isPending}>
              {startEnroll.isPending ? "Preparing…" : "Add authenticator app"}
            </Button>
          )}

          {status ? <p className="mt-4 text-sm text-muted-foreground">{status}</p> : null}
        </section>

        <section className="h-fit rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold">Account hygiene</h2>
          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li>· Every sign-in, role change and record edit is written to the audit log.</li>
            <li>· Sessions end when you sign out; close shared browsers when you leave a workstation.</li>
            <li>· Never paste protected health information into external tools or the AI console.</li>
            <li>· Report suspected account compromise to an administrator immediately.</li>
          </ul>
          <Button
            variant="outline"
            className="mt-5"
            onClick={async () => {
              await supabase.auth.signOut({ scope: "others" });
              setStatus("Signed out of all other devices.");
            }}
          >
            Sign out other devices
          </Button>
        </section>
      </div>
    </AdminShell>
  );
}
