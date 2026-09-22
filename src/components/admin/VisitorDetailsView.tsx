/**
 * Everything the visitor told us, in one panel.
 *
 * The widget's "Speak to a live agent" form captures far more than a name and
 * a phone number — the reason for the request, language, eligibility details
 * and consent — and staff need all of it wherever they open a conversation.
 * This file is the presentation only, with no data access, so it can be
 * rendered in a test and reused by the Inbox, Contacts, Intake, Notifications
 * and Quality screens alike.
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatInZone } from "@/lib/org-time";

export const LEAD_STATUSES = ["new", "working", "qualified", "converted", "closed"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type VisitorDetailsContact = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  preferred_language: string | null;
  preferred_contact_method: string | null;
  county: string | null;
  zip_code: string | null;
  health_plan: string | null;
  service_interest: string | null;
  visitor_type: string | null;
  lead_status: string | null;
  consent_given: boolean | null;
  consent_at: string | null;
};

export type VisitorDetailsConversation = {
  id: string;
  escalation_reason: string | null;
  escalation_requested: boolean | null;
  visitor_type: string | null;
  requested_agent_at: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

export type VisitorDetailsData = {
  conversation: VisitorDetailsConversation | null;
  contact: VisitorDetailsContact | null;
  departmentName?: string | null;
  /** Where the visitor was on the site when they asked for help. */
  pageUrl?: string | null;
  firstSeenAt?: string | null;
  messageCount?: number | null;
};

const VISITOR_TYPE_LABEL: Record<string, string> = {
  member: "Member",
  prospect: "Prospect",
  provider: "Provider",
  other: "Other",
};

function labelVisitorType(value: string | null | undefined): string | null {
  if (!value) return null;
  return VISITOR_TYPE_LABEL[value] ?? value.replace(/_/g, " ");
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </h3>
      <dl className="mt-2 space-y-2 text-sm">{children}</dl>
    </section>
  );
}

function Field({ term, value }: { term: string; value: ReactNode | null | undefined }) {
  // An optional field the visitor never filled in simply collapses.
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}

/**
 * The panel itself. `onLeadStatus` is optional: screens where the viewer may
 * not edit contacts simply render the status as text.
 */
export function VisitorDetailsView({
  data,
  onLeadStatus,
  savingLeadStatus,
  heading = "Visitor details",
}: {
  data: VisitorDetailsData;
  onLeadStatus?: (status: LeadStatus) => void;
  savingLeadStatus?: boolean;
  heading?: string;
}) {
  const { conversation, contact } = data;
  const metadata = (conversation?.metadata ?? {}) as Record<string, unknown>;
  const pageUrl =
    data.pageUrl ?? (typeof metadata["page_url"] === "string" ? metadata["page_url"] : null);
  const afterHours =
    typeof metadata["after_hours"] === "boolean" ? (metadata["after_hours"] as boolean) : null;

  if (!contact) {
    // An AI-only chat: nobody filled the form, but the little we know still
    // beats an empty panel.
    return (
      <div>
        <h2 className="text-sm font-semibold">{heading}</h2>
        <div className="mt-3 rounded-lg border border-dashed border-border p-3">
          <p className="text-sm font-medium">Anonymous visitor</p>
          <dl className="mt-2 space-y-2 text-sm">
            <Field term="Visitor type" value={labelVisitorType(conversation?.visitor_type)} />
            <Field
              term="Page URL"
              value={
                pageUrl ? (
                  <a
                    className="break-all text-primary hover:underline"
                    href={pageUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {pageUrl}
                  </a>
                ) : null
              }
            />
            <Field
              term="First seen"
              value={
                data.firstSeenAt || conversation?.created_at
                  ? formatInZone(data.firstSeenAt ?? conversation!.created_at!)
                  : null
              }
            />
            <Field
              term="Messages"
              value={
                typeof data.messageCount === "number" ? String(data.messageCount) : null
              }
            />
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Visitor did not request an agent.
          </p>
        </div>
      </div>
    );
  }

  const consentLabel = contact.consent_given
    ? `Consented to contact${contact.consent_at ? ` · ${formatInZone(contact.consent_at)}` : ""}`
    : "No consent recorded";

  const eligibility = [
    contact.county,
    contact.zip_code,
    contact.health_plan,
    contact.service_interest,
  ].some(Boolean);

  return (
    <div>
      <h2 className="text-sm font-semibold">{heading}</h2>

      <Group title="Contact">
        <Field term="Full name" value={contact.full_name} />
        <Field
          term="Email"
          value={
            contact.email ? (
              <a className="text-primary hover:underline" href={`mailto:${contact.email}`}>
                {contact.email}
              </a>
            ) : null
          }
        />
        <Field
          term="Phone"
          value={
            contact.phone ? (
              <a className="text-primary hover:underline" href={`tel:${contact.phone}`}>
                {contact.phone}
              </a>
            ) : null
          }
        />
        <Field term="Preferred language" value={contact.preferred_language} />
        <Field term="Preferred contact method" value={contact.preferred_contact_method} />
      </Group>

      <Group title="Request">
        <Field
          term="Reason for request"
          value={
            <span className="whitespace-pre-wrap">
              {conversation?.escalation_reason || "No reason given."}
            </span>
          }
        />
        <Field term="Department" value={data.departmentName} />
        <Field
          term="Visitor type"
          value={labelVisitorType(contact.visitor_type ?? conversation?.visitor_type)}
        />
        <Field
          term="After hours"
          value={afterHours === null ? null : afterHours ? "Yes — outside business hours" : "No"}
        />
        <Field
          term="Page URL"
          value={
            pageUrl ? (
              <a
                className="break-all text-primary hover:underline"
                href={pageUrl}
                target="_blank"
                rel="noreferrer"
              >
                {pageUrl}
              </a>
            ) : null
          }
        />
        <Field
          term="Requested at"
          value={
            conversation?.requested_agent_at ? formatInZone(conversation.requested_agent_at) : null
          }
        />
      </Group>

      {eligibility ? (
        <Group title="Eligibility">
          <Field term="County" value={contact.county} />
          <Field term="ZIP" value={contact.zip_code} />
          <Field term="Health plan" value={contact.health_plan} />
          <Field term="Service interest" value={contact.service_interest} />
        </Group>
      ) : null}

      <Group title="Consent">
        <Field term="Consent" value={consentLabel} />
      </Group>

      <Group title="Lead status">
        {onLeadStatus ? (
          <div className="flex flex-wrap gap-1.5">
            {LEAD_STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={contact.lead_status === s ? "default" : "outline"}
                disabled={savingLeadStatus}
                onClick={() => onLeadStatus(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        ) : (
          <Badge variant="outline">{contact.lead_status ?? "new"}</Badge>
        )}
        <div className="pt-1">
          <a
            href={`/contacts?id=${contact.id}`}
            className="text-sm font-medium text-primary hover:underline"
          >
            Contact record
          </a>
        </div>
      </Group>
    </div>
  );
}
