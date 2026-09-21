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
import { useServerFn } from "@tanstack/react-start";
import { StaffAvatar, useStaffAvatarUrl } from "@/components/admin/StaffAvatar";
import { removeStaffAvatarFn, uploadStaffAvatarFn } from "@/lib/staff-avatar.functions";
import { MAX_AVATAR_BYTES, sniffImage } from "@/lib/image-bytes";
import { AlertPreferences } from "@/components/settings/AlertPreferences";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My settings — CareConnect" },
      {
        name: "description",
        content:
          "Personal profile, availability, appearance and security settings for your CareConnect account.",
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
  // `avatarUrl` holds the stored object path; `signedAvatar` is the freshly
  // uploaded link so the new photo shows without waiting for a refetch.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [signedAvatar, setSignedAvatar] = useState<string | null>(null);
  const uploadAvatar = useServerFn(uploadStaffAvatarFn);
  const removeAvatar = useServerFn(removeStaffAvatarFn);
  const avatarQuery = useStaffAvatarUrl(userId);
  // Public visibility of name + photo in the widget. Opt-in, never assumed.
  const [showInWidget, setShowInWidget] = useState(false);
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
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Keyed on the profile id so a background refetch cannot discard edits.
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
    setShowInWidget(p.show_in_widget_team === true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data?.id]);

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
          show_in_widget_team: showInWidget,
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

  async function refreshAvatarQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["my-profile", userId] }),
      queryClient.invalidateQueries({ queryKey: ["profile"] }),
      queryClient.invalidateQueries({ queryKey: ["staff"] }),
      queryClient.invalidateQueries({ queryKey: ["staff-avatar", userId] }),
      queryClient.invalidateQueries({ queryKey: ["session-context"] }),
    ]);
  }

  async function handleAvatarUpload(file: File) {
    if (!userId) return;
    setNotice(null);
    if (file.size > MAX_AVATAR_BYTES) {
      setNotice("Photos must be under 5 MB.");
      return;
    }
    setUploading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!sniffImage(bytes)) {
        setNotice("Please choose a PNG or JPG photo.");
        return;
      }
      let binary = "";
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const result = await uploadAvatar({ data: { base64: btoa(binary) } });
      setSignedAvatar(result.url ?? null);
      setAvatarUrl(result.path);
      setNotice("Profile photo updated.");
      await refreshAvatarQueries();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Photo upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleAvatarRemove() {
    if (!userId) return;
    try {
      await removeAvatar({});
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not remove the photo");
      return;
    }
    setSignedAvatar(null);
    setAvatarUrl(null);
    setNotice("Profile photo removed.");
    await refreshAvatarQueries();
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

  return (
    <AdminShell
      title="My settings"
      description="Your personal profile, availability, appearance and account security."
    >
      <div className="max-w-3xl space-y-5">
        {notice && (
          <p className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-foreground">
            {notice}
          </p>
        )}

        {/* Account */}
        <form
          className="space-y-4 rounded-xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setNotice(null);
            save.mutate();
          }}
        >
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Account</h2>
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
              <Label>Email</Label>
              <Input value={session.data?.email ?? ""} disabled readOnly />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Your role, organization, departments and maximum simultaneous chats are managed by an
            administrator.
          </p>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </Button>
        </form>

        {/* Profile photo */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <Label>Profile photo</Label>
            <p className="text-xs text-muted-foreground">
              PNG or JPG up to 5 MB. Shown to teammates in CareConnect. It is only shown to website
              visitors if you turn on public visibility below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <StaffAvatar
              userId={userId}
              name={form.display_name || form.full_name}
              className="h-16 w-16"
              imageUrl={signedAvatar ?? (avatarUrl ? (avatarQuery.data ?? null) : null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="avatar-file"
                type="file"
                accept="image/png,image/jpeg"
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
          <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
              checked={showInWidget}
              onChange={(e) => setShowInWidget(e.target.checked)}
            />
            <span>
              <span className="font-medium">Show my name and photo to website visitors</span>
              <span className="block text-xs text-muted-foreground">
                Off by default. When on, your photo can appear on the chat widget and while you are
                chatting with a visitor.
              </span>
            </span>
          </label>
        </section>

        {/* Alert preferences */}
        <AlertPreferences />

        {/* Presence & capacity */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Presence &amp; capacity</h2>
            <p className="text-xs text-muted-foreground">
              Your availability decides whether new chats can be routed to you.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
              <Label>Maximum simultaneous chats</Label>
              <Input
                value={String(profile.data?.max_concurrent_chats ?? "")}
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">Set by an administrator.</p>
            </div>
          </div>
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save availability"}
          </Button>
        </section>


        {/* Appearance */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Appearance</h2>
            <p className="text-xs text-muted-foreground">
              Choose how the console looks on this account.
            </p>
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

        {/* Security */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Security</h2>
            <p className="text-xs text-muted-foreground">
              Password and two-step verification for your account.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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
