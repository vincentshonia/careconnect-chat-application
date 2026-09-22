/**
 * The visitor details panel must never quietly drop something the visitor
 * told us, so this renders it with a fully completed form and checks that
 * every label and value reaches the screen.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitorDetailsView } from "@/components/admin/VisitorDetailsView";

function render(props: Parameters<typeof VisitorDetailsView>[0]) {
  return renderToStaticMarkup(createElement(VisitorDetailsView, props));
}

const fullContact = {
  id: "11111111-1111-1111-1111-111111111111",
  full_name: "Rahnesha Platt",
  email: "rahnesha@example.com",
  phone: "8463524279",
  preferred_language: "Spanish",
  preferred_contact_method: "Phone",
  county: "San Diego",
  zip_code: "92101",
  health_plan: "Medi-Cal",
  service_interest: "Enhanced Care Management",
  visitor_type: "member",
  lead_status: "new",
  consent_given: true,
  consent_at: "2026-09-21T23:36:00.000Z",
};

const conversation = {
  id: "22222222-2222-2222-2222-222222222222",
  escalation_reason: "Information on program",
  escalation_requested: true,
  visitor_type: "member",
  requested_agent_at: "2026-09-21T23:36:00.000Z",
  created_at: "2026-09-21T23:30:00.000Z",
  metadata: { page_url: "https://mypacifichealth.com/ecm", after_hours: true },
};

describe("visitor details panel", () => {
  const html = render({
    data: {
      conversation,
      contact: fullContact,
      departmentName: "Member Engagement",
    },
  });

  it.each([
    "Contact",
    "Full name",
    "Email",
    "Phone",
    "Preferred language",
    "Preferred contact method",
    "Request",
    "Reason for request",
    "Department",
    "Visitor type",
    "After hours",
    "Page URL",
    "Requested at",
    "Eligibility",
    "County",
    "ZIP",
    "Health plan",
    "Service interest",
    "Consent",
    "Lead status",
    "Contact record",
  ])("shows the %s label", (label) => {
    expect(html).toContain(label);
  });

  it("shows the captured values, not just the labels", () => {
    expect(html).toContain("Rahnesha Platt");
    expect(html).toContain("Information on program");
    expect(html).toContain("Member Engagement");
    expect(html).toContain("Medi-Cal");
    expect(html).toContain("92101");
    expect(html).toContain("Consented to contact");
    expect(html).toContain("mailto:rahnesha@example.com");
    expect(html).toContain("tel:8463524279");
    expect(html).toContain("https://mypacifichealth.com/ecm");
  });

  it("collapses eligibility when the visitor gave none", () => {
    const bare = render({
      data: {
        conversation,
        contact: {
          ...fullContact,
          county: null,
          zip_code: null,
          health_plan: null,
          service_interest: null,
        },
      },
    });
    expect(bare).not.toContain("Eligibility");
  });

  it("describes an AI-only chat with no form", () => {
    const anonymous = render({
      data: {
        conversation: { ...conversation, escalation_reason: null, escalation_requested: false },
        contact: null,
        pageUrl: "https://mypacifichealth.com/",
        messageCount: 4,
      },
    });
    expect(anonymous).toContain("Anonymous visitor");
    expect(anonymous).toContain("Visitor did not request an agent.");
    expect(anonymous).toContain("Messages");
  });
});
