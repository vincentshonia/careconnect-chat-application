/**
 * Data loader around {@link VisitorDetailsView}.
 *
 * Given a conversation, it gathers the contact record the widget form created,
 * the department the request was routed to, the page the visitor was on and —
 * for AI-only chats with no form — the handful of facts we do know.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateContactFn } from "@/lib/contacts.functions";
import {
  VisitorDetailsView,
  type LeadStatus,
  type VisitorDetailsContact,
  type VisitorDetailsConversation,
} from "@/components/admin/VisitorDetailsView";

const CONTACT_COLUMNS =
  "id, full_name, email, phone, preferred_language, preferred_contact_method, county, zip_code, health_plan, service_interest, visitor_type, lead_status, consent_given, consent_at";

export function VisitorDetailsPanel({
  conversationId,
  editable = true,
  heading,
}: {
  conversationId: string | null | undefined;
  editable?: boolean;
  heading?: string;
}) {
  const queryClient = useQueryClient();
  const saveContact = useServerFn(updateContactFn);

  const query = useQuery({
    queryKey: ["visitor-details", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const { data: conversation, error } = await supabase
        .from("conversations")
        .select(
          "id, contact_id, visitor_id, department_id, visitor_type, escalation_reason, escalation_requested, requested_agent_at, created_at, metadata",
        )
        .eq("id", conversationId!)
        .maybeSingle();
      if (error) throw error;
      if (!conversation) return null;

      const [contactRes, departmentRes, visitorRes, countRes] = await Promise.all([
        conversation.contact_id
          ? supabase
              .from("contacts")
              .select(CONTACT_COLUMNS)
              .eq("id", conversation.contact_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        conversation.department_id
          ? supabase
              .from("departments")
              .select("name")
              .eq("id", conversation.department_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        conversation.visitor_id
          ? supabase
              .from("visitors")
              .select("current_page, landing_page, created_at")
              .eq("id", conversation.visitor_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("conversation_id", conversation.id),
      ]);

      const visitor = (visitorRes as { data: Record<string, string | null> | null }).data;
      return {
        conversation: {
          id: conversation.id,
          escalation_reason: conversation.escalation_reason,
          escalation_requested: conversation.escalation_requested,
          visitor_type: conversation.visitor_type,
          requested_agent_at: conversation.requested_agent_at,
          created_at: conversation.created_at,
          metadata: (conversation.metadata ?? null) as Record<string, unknown> | null,
        } satisfies VisitorDetailsConversation,
        contact: ((contactRes as { data: unknown }).data ?? null) as VisitorDetailsContact | null,
        departmentName:
          (departmentRes as { data: { name?: string } | null }).data?.name ?? null,
        pageUrl: visitor?.["current_page"] ?? visitor?.["landing_page"] ?? null,
        firstSeenAt: visitor?.["created_at"] ?? null,
        messageCount: (countRes as { count?: number | null }).count ?? null,
      };
    },
  });

  const setLeadStatus = useMutation({
    mutationFn: async (status: LeadStatus) => {
      const id = query.data?.contact?.id;
      if (!id) return;
      await saveContact({ data: { id, leadStatus: status } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visitor-details", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not update the lead status"),
  });

  if (!conversationId) return null;
  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">Loading visitor details…</p>;
  }

  return (
    <VisitorDetailsView
      heading={heading}
      data={
        query.data ?? {
          conversation: null,
          contact: null,
        }
      }
      onLeadStatus={editable ? (s) => setLeadStatus.mutate(s) : undefined}
      savingLeadStatus={setLeadStatus.isPending}
    />
  );
}
