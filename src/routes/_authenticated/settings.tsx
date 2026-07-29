import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { useSessionContext } from "@/hooks/use-session-context";
import { AdminShell } from "@/components/admin/AdminShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Pacific Health Group Support Console" },
      { name: "description", content: "Organization contact details, AI guardrails and compliance notices." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const orgId = session.data?.organizationId ?? null;
  const isAdmin = session.data?.isAdmin ?? false;
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    timezone: "",
    ai_instructions: "",
    emergency_message: "",
    privacy_notice: "",
  });

  const org = useQuery({
    queryKey: ["org-settings", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("*").eq("id", orgId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (org.data) {
      setForm({
        name: org.data.name ?? "",
        phone: org.data.phone ?? "",
        email: org.data.email ?? "",
        address: org.data.address ?? "",
        timezone: org.data.timezone ?? "",
        ai_instructions: org.data.ai_instructions ?? "",
        emergency_message: org.data.emergency_message ?? "",
        privacy_notice: org.data.privacy_notice ?? "",
      });
    }
  }, [org.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      const { error } = await supabase
        .from("organizations")
        .update({
          name: form.name,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          timezone: form.timezone || "America/Los_Angeles",
          ai_instructions: form.ai_instructions || null,
          emergency_message: form.emergency_message,
          privacy_notice: form.privacy_notice,
        })
        .eq("id", orgId);
      if (error) throw error;
      await logAudit({
        action: "organization_settings.updated",
        recordType: "organizations",
        recordId: orgId,
        newValue: { name: form.name, timezone: form.timezone, ai_instructions_changed: true },
      });
    },
    onSuccess: () => {
      setNotice("Settings saved.");
      queryClient.invalidateQueries({ queryKey: ["org-settings", orgId] });
    },
    onError: (e) => setNotice(e instanceof Error ? e.message : "Save failed"),
  });

  return (
    <AdminShell
      title="Settings"
      description="Organization details, chatbot guardrails, and the compliance language shown to visitors."
    >
      <form
        className="max-w-3xl space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          setNotice(null);
          save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="name" label="Organization name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field id="timezone" label="Timezone" value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })} />
          <Field id="phone" label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
          <Field id="email" label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ai">Chatbot instructions</Label>
          <Textarea
            id="ai"
            rows={5}
            value={form.ai_instructions}
            onChange={(e) => setForm({ ...form, ai_instructions: e.target.value })}
            placeholder="Tone, escalation rules, phrases to avoid…"
          />
          <p className="text-xs text-muted-foreground">
            Applied on top of the built-in safety rules: answers stay grounded in approved knowledge, and the bot never
            diagnoses, promises eligibility, or gives legal advice.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="emergency">Emergency / crisis message</Label>
          <Textarea
            id="emergency"
            rows={3}
            value={form.emergency_message}
            onChange={(e) => setForm({ ...form, emergency_message: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="privacy">Privacy notice</Label>
          <Textarea
            id="privacy"
            rows={3}
            value={form.privacy_notice}
            onChange={(e) => setForm({ ...form, privacy_notice: e.target.value })}
          />
        </div>

        {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!isAdmin || save.isPending}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
          {!isAdmin ? (
            <span className="text-sm text-muted-foreground">Administrators can edit these settings.</span>
          ) : null}
        </div>
      </form>
    </AdminShell>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
