import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminShell";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTheme, type ThemePreference } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My settings — CareConnect" },
      {
        name: "description",
        content: "Personal profile, availability, appearance and security settings for your CareConnect account.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PersonalSettingsPage,
});

const PRESENCE = [
  { value: "available", label: "Available" },
  { value: "busy", label: "Busy" },
  { value: "away", label: "Away" },
  { value: "offline", label: "Offline" },
] as const;

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Match device" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function PersonalSettingsPage() {
  const queryClient = useQueryClient();
  const session = useSessionContext();
  const userId = session.data?.userId ?? null;
  const { preference, setThemePreference } = useTheme();

  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    display_name: "",
    title: "",
    phone: "",
    languages: "",
    timezone: "",
    presence: "available",
  });

  const profile = useQuery({
    queryKey: ["my-profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setForm({
      full_name: p.full_name ?? "",
      display_name: p.display_name ?? "",
      title: p.title ?? "",
      phone: p.phone ?? "",
      languages: (p.languages ?? []).join(", "),
      timezone: p.timezone ?? "",
      presence: p.presence ?? "available",
    });
    setAvatarUrl(p.avatar_url ?? null);
  }, [profile.data]);

  // Reflect the saved appearance choice once the profile loads.
  useEffect(() => {
    const saved = profile.data?.theme_preference as ThemePreference | undefined;
    if (saved && saved !== preference) setThemePreference(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data?.theme_preference]);

  const save = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: form.full_name,
          display_name: form.display_name || null,
          title: form.title || null,
          phone: form.phone || null,
          timezone: form.timezone || null,
          presence: form.presence,
          languages: form.languages
            .split(",")
            .map((l) => l.trim())
            .filter(Boolean),
        })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: async () => {
      setNotice("Your settings were saved.");
      await queryClient.invalidateQueries({ queryKey: ["my-profile", userId] });
      await queryClient.invalidateQueries({ queryKey: ["session-context"] });
    },
    onError: (e) => setNotice(e instanceof Error ? e.message : "Could not save your settings"),
  });

  async function handleAvatarUpload(file: File) {
    if (!userId) return;
    setNotice(null);
    if (file.size > 5 * 1024 * 1024) {
      setNotice("Photos must be under 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("staff-avatars")
        .upload(path, file, { cacheControl: "300", upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;

      const url = `/api/public/staff-avatar/${path}`;
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", userId);
      if (error) throw error;
      setAvatarUrl(url);
      setNotice("Profile photo updated.");
      await queryClient.invalidateQueries({ queryKey: ["my-profile", userId] });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleAvatarRemove() {
    if (!userId) return;
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", userId);
    if (error) {
      setNotice(error.message);
      return;
    }
    setAvatarUrl(null);
    setNotice("Profile photo removed.");
    await queryClient.invalidateQueries({ queryKey: ["my-profile", userId] });
  }

  async function handleThemeChange(value: ThemePreference) {
    setThemePreference(value);
    if (!userId) return;
    await supabase.from("profiles").update({ theme_preference: value }).eq("id", userId);
    await queryClient.invalidateQueries({ queryKey: ["my-profile", userId] });
  }

  async function sendPasswordReset() {
    const email = session.data?.email;
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setNotice(error ? error.message : `Password reset link sent to ${email}.`);
  }

  const initials = (form.display_name || form.full_name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <AdminShell
      title="My settings"
      description="Your personal profile, availability, appearance and account security."
    >
      <div className="max-w-3xl space-y-5">
        {notice && (
          <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground">{notice}</p>
        )}

        {/* Profile photo */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <Label>Profile photo</Label>
            <p className="text-xs text-muted-foreground">
              PNG or JPG up to 5 MB. Shown to teammates and to visitors while you are chatting.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-border bg-muted text-sm font-semibold text-muted-foreground">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Your profile photo" className="h-full w-full object-cover" />
              ) : (
                initials || "—"
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="avatar-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleAvatarUpload(file);
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => document.getElementById("avatar-file")?.click()}
              >
                {uploading ? "Uploading…" : avatarUrl ? "Replace photo" : "Upload photo"}
              </Button>
              {avatarUrl && (
                <Button type="button" variant="ghost" onClick={() => void handleAvatarRemove()}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </section>

        {/* Personal details */}
        <form
          className="space-y-4 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setNotice(null);
            save.mutate();
          }}
        >
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Personal details</h2>
            <p className="text-xs text-muted-foreground">
              Your display name is what website visitors see during a live chat.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Display name (visitor-facing)</Label>
              <Input
                id="display_name"
                placeholder="e.g. Maria from Pacific Health"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Job title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="languages">Languages spoken</Label>
              <Input
                id="languages"
                placeholder="English, Spanish"
                value={form.languages}
                onChange={(e) => setForm((f) => ({ ...f, languages: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Time zone</Label>
              <Input
                id="timezone"
                placeholder="America/Los_Angeles"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="presence">Availability</Label>
              <select
                id="presence"
                value={form.presence}
                onChange={(e) => setForm((f) => ({ ...f, presence: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PRESENCE.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={session.data?.email ?? ""} disabled readOnly />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Your role, organization, departments and maximum simultaneous chats are managed by an administrator.
          </p>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>

        {/* Appearance */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Appearance</h2>
            <p className="text-xs text-muted-foreground">Choose how the console looks on this account.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.value}
                type="button"
                variant={preference === t.value ? "default" : "outline"}
                onClick={() => void handleThemeChange(t.value)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        </section>

        {/* Notifications + security */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Notifications & security</h2>
            <p className="text-xs text-muted-foreground">
              Alert channels and desktop notifications live on the Notifications page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/notifications">Notification preferences</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/mfa">Two-step verification</Link>
            </Button>
            <Button type="button" variant="outline" onClick={() => void sendPasswordReset()}>
              Send password reset email
            </Button>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
