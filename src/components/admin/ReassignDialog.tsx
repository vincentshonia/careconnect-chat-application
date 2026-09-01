/**
 * Transfer / reassignment picker.
 *
 * The list is resolved server-side: only teammates who are active members of
 * the organization, in the conversation's department and in a role that takes
 * chats appear at all. Ineligible teammates (unavailable or at capacity) stay
 * visible with the reason, but selecting one requires an explicit administrator
 * override, which is audited.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  reassignConversationFn,
  reassignmentCandidatesFn,
} from "@/lib/conversations.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ReassignDialog({
  conversationId,
  currentAssignee,
  onDone,
}: {
  conversationId: string;
  currentAssignee: string | null;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const candidatesFn = useServerFn(reassignmentCandidatesFn);
  const reassignFn = useServerFn(reassignConversationFn);

  const query = useQuery({
    queryKey: ["reassign-candidates", conversationId],
    enabled: open,
    queryFn: async () => candidatesFn({ data: { conversationId } }),
  });

  const reassign = useMutation({
    mutationFn: async (input: { userId: string | null; override?: boolean }) =>
      reassignFn({
        data: {
          conversationId,
          userId: input.userId,
          ...(input.override ? { override: true, overrideReason: reason.trim() } : {}),
        },
      }),
    onSuccess: (r) => {
      toast.success(r?.assignedName ? `Reassigned to ${r.assignedName}` : "Returned to the queue");
      setOpen(false);
      setOverrideFor(null);
      setReason("");
      onDone();
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not reassign this conversation"),
  });

  const candidates = query.data?.candidates ?? [];
  const canOverride = query.data?.canOverride ?? false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Reassign
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reassign conversation</DialogTitle>
          <DialogDescription>
            Only teammates in this conversation&apos;s department with a chat-handling role are
            listed.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[22rem] space-y-2 overflow-y-auto">
          {query.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading teammates…</p>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teammate in this department can take this conversation right now.
            </p>
          ) : (
            candidates.map((c) => {
              const isCurrent = c.user_id === currentAssignee;
              const showOverride = overrideFor === c.user_id;
              return (
                <div
                  key={c.user_id}
                  className="rounded-lg border border-border/60 p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.full_name}</span>
                    <Badge variant={c.presence === "available" ? "default" : "secondary"}>
                      {c.presence}
                    </Badge>
                    {isCurrent ? <Badge variant="outline">Current owner</Badge> : null}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.active_chats} active
                      {c.capacity > 0 ? ` / ${c.capacity}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.department_names.length ? c.department_names.join(", ") : "No department"} ·{" "}
                    {c.role.replace("_", " ")}
                    {c.eligible ? "" : ` · ${c.reason ?? "not eligible"}`}
                  </p>

                  {showOverride ? (
                    <div className="mt-2 space-y-2">
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason for overriding availability"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={reassign.isPending || reason.trim().length < 3}
                          onClick={() => reassign.mutate({ userId: c.user_id, override: true })}
                        >
                          Confirm override
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setOverrideFor(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      {isCurrent ? null : c.eligible ? (
                        <Button
                          size="sm"
                          disabled={reassign.isPending}
                          onClick={() => reassign.mutate({ userId: c.user_id })}
                        >
                          Assign
                        </Button>
                      ) : canOverride && c.reason !== "Not in this department" &&
                        c.reason !== "Account is not active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setOverrideFor(c.user_id);
                            setReason("");
                          }}
                        >
                          Override…
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {currentAssignee ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={reassign.isPending}
            onClick={() => reassign.mutate({ userId: null })}
          >
            Return to the department queue
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
