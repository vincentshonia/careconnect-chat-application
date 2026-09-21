import React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  /** Team that owns the waiting chat, e.g. "Member Engagement". */
  departmentName?: string | null;
  /** Short alert label, e.g. "New chat waiting for a human". */
  reason?: string;
  /** Human reference so staff can talk about the same conversation. */
  referenceId?: string | null;
  /** Absolute link into the console thread. */
  conversationUrl?: string;
  organizationName?: string;
}

const BRAND_DEEP = "#1d4363";
const BRAND_LIGHT = "#3d85c6";

const main = {
  backgroundColor: "#eef3f8",
  fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  padding: "28px 0",
};
const container = { maxWidth: "600px", margin: "0 auto", padding: "0 16px" };
const card = {
  backgroundColor: "#ffffff",
  borderRadius: "16px",
  overflow: "hidden" as const,
  border: "1px solid #dbe5ef",
};
const brandBar = {
  background: `linear-gradient(120deg, ${BRAND_DEEP} 0%, ${BRAND_LIGHT} 100%)`,
  backgroundColor: BRAND_DEEP,
  padding: "24px 32px",
};
const brandText = { color: "#ffffff", fontSize: "20px", fontWeight: 700, margin: "0" };
const brandSub = { color: "#d6e6f5", fontSize: "13px", margin: "6px 0 0" };
const inner = { padding: "28px 32px 8px" };
const heading = { color: BRAND_DEEP, fontSize: "21px", fontWeight: 700, margin: "0 0 10px" };
const paragraph = { color: "#3f4c5a", fontSize: "15px", lineHeight: "25px", margin: "0 0 16px" };
const detailBox = {
  border: "1px solid #dbe5ef",
  borderLeft: `4px solid ${BRAND_LIGHT}`,
  borderRadius: "12px",
  backgroundColor: "#f5f9fd",
  padding: "16px 20px",
  margin: "18px 0",
};
const detailLabel = {
  color: BRAND_LIGHT,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  margin: "0 0 2px",
};
const detailValue = { color: "#16283a", fontSize: "15px", fontWeight: 600, margin: "0 0 12px" };
const button = {
  backgroundColor: BRAND_DEEP,
  borderRadius: "10px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 600,
  padding: "12px 22px",
  textDecoration: "none",
  display: "inline-block",
};
const note = { color: "#6b7a8c", fontSize: "13px", lineHeight: "20px", margin: "12px 0 0" };
const hr = { borderColor: "#e2eaf3", margin: "24px 0 16px" };
const footer = {
  backgroundColor: "#f5f9fd",
  padding: "18px 32px",
  borderTop: "1px solid #dbe5ef",
};
const footerText = { color: "#6b7a8c", fontSize: "12px", lineHeight: "19px", margin: "0 0 4px" };

const Detail = ({ label, value }: { label: string; value?: string | null }) =>
  value ? (
    <>
      <Text style={detailLabel}>{label}</Text>
      <Text style={detailValue}>{value}</Text>
    </>
  ) : null;

/**
 * Staff-facing alert that a visitor is waiting. Deliberately carries no
 * visitor details — name, contact and message stay inside the console.
 */
const StaffChatAlertEmail = ({
  departmentName,
  reason = "A visitor is waiting for a human",
  referenceId,
  conversationUrl = "https://chat.mypacifichealth.com/inbox",
  organizationName = "Pacific Health Group",
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>A visitor is waiting{departmentName ? ` — ${departmentName}` : ""}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={card}>
          <Section style={brandBar}>
            <Text style={brandText}>{organizationName}</Text>
            <Text style={brandSub}>Support console alert</Text>
          </Section>

          <Section style={inner}>
            <Heading style={heading}>A visitor is waiting</Heading>
            <Text style={paragraph}>
              A conversation needs a person{departmentName ? ` on the ${departmentName} team` : ""}.
              Open it in the console to read the thread and reply.
            </Text>

            <Section style={detailBox}>
              <Detail label="Team" value={departmentName} />
              <Detail label="Reason" value={reason} />
              <Detail label="Reference" value={referenceId} />
            </Section>

            <Button href={conversationUrl} style={button}>
              Open the conversation
            </Button>

            <Hr style={hr} />
            <Text style={note}>
              For privacy, this email contains no visitor details or health information — everything
              is in the console.
            </Text>
          </Section>

          <Section style={footer}>
            <Text style={footerText}>
              {organizationName} support console · you receive these because chat alert emails are
              switched on in your notification settings.
            </Text>
          </Section>
        </Section>
      </Container>
    </Body>
  </Html>
);

export const template: TemplateEntry = {
  component: StaffChatAlertEmail,
  displayName: "Staff alert — a visitor is waiting",
  subject: (data) => `A visitor is waiting${data?.departmentName ? ` — ${data.departmentName}` : ""}`,
  previewData: {
    departmentName: "Member Engagement",
    reason: "New chat waiting for a human",
    referenceId: "CC-10234",
    conversationUrl: "https://chat.mypacifichealth.com/inbox",
  },
};
