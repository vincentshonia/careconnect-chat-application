import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  createInvitationFn,
  listInvitationsFn,
  revokeInvitationFn,
} from "@/lib/invitations.functions";

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
};

const ROLES = ["agent", "team_lead", "manager", "administrator"] as const;

/**
 * Invite teammates without creating credentials for them: a single-use,
 * expiring link bound to their email address.
 */
export function InvitationsCard({ callerRank }: { callerRank: number }) {
  const queryClient = useQueryClient();
  const list = useServerFn(listInvitationsFn);
  const create = useServerFn(createInvitationFn);
  const revoke = useServerFn(revokeInvitationFn);

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("agent");
  const [link, setLink] = useState<string | null>(null);

  const invitations = useQuery({
    queryKey: ["invitations"],
    queryFn: async () => (await list()) as unknown as Invitation[],
  });

  const send = useMutation({
    mutationFn: async () => create({ data: { email, role, expiresInDays: 7 } }),
    onSuccess: (result) => {
      setLink(`${window.location.origin}/invite?t=${result.token}`);
      setEmail("");
      toast.success("Invitation created — copy the link and send it to them.");
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => revoke({ data: { id } }),
    onSuccess: () => {
      toast.success("Invitation revoked");
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const pending = (invitations.data ?? []).filter((i) => i.status === "pending");

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Invite a teammate</h2>
          <p className="text-xs text-muted-foreground">
            Sends a single-use link that expires in 7 days and only works for that email address.
          </p>
        </div>
        <Button type="button" variant={open ? "outline" : "default"} onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Invite teammate"}
        </Button>
      </div>

      {open ? (
        <form
          className="mt-4 grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            send.mutate();
          }}
        >
          <div className="space-y-1">
            <Label className="text-xs">Work email</Label>
            <Input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maria@example.com"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            >
              {ROLES.filter((_, i) => i + 1 <= callerRank).map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={send.isPending}>
              {send.isPending ? "Creating…" : "Create invitation"}
            </Button>
          </div>
        </form>
      ) : null}

      {link ? (
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm font-medium">Copy this link now — it is shown only once</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{link}</p>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(link);
                toast.success("Link copied");
              }}
            >
              Copy link
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setLink(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {pending.length ? (
        <ul className="mt-4 space-y-2">
          {pending.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
            >
              <span className="text-sm">{invite.email}</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {invite.role.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  expires {new Date(invite.expires_at).toLocaleDateString()}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => cancel.mutate(invite.id)}
                >
                  Revoke
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
