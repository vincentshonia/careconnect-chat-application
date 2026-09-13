import React from "react";
import {
  Body,
  Img,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  /** Visitor's name as they entered it. */
  fullName?: string;
  organizationName?: string;
  /** Short human reference so staff and the member can talk about the same request. */
  referenceId?: string;
  /** "callback", "referral", "enrollment", "general" — already humanized by the caller. */
  requestType?: string;
  serviceInterest?: string | null;
  county?: string | null;
  preferredLanguage?: string | null;
  /** What the visitor typed as their reason. */
  message?: string | null;
  /** Submitted outside operating hours — changes the expectation we set. */
  afterHours?: boolean;
  /** Plain-language response expectation, e.g. "within one business day". */
  responseTime?: string;
  logoUrl?: string;
  primaryColor?: string;
  supportUrl?: string;
  supportPhone?: string;
  /** Shown for urgent situations; never replaces 911 guidance. */
  crisisPhone?: string;
}

/** Pacific Health Group brand palette */
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
  padding: "28px 32px",
};
const logoImg = { maxHeight: "40px", maxWidth: "220px", display: "block" };
const brandText = {
  color: "#ffffff",
  fontSize: "22px",
  fontWeight: 700,
  letterSpacing: "-0.01em",
  margin: "0",
};
const brandSub = {
  color: "#d6e6f5",
  fontSize: "13px",
  letterSpacing: "0.04em",
  margin: "6px 0 0",
};
const inner = { padding: "30px 32px 8px" };
const heading = { color: BRAND_DEEP, fontSize: "22px", fontWeight: 700, margin: "0 0 10px" };
const paragraph = { color: "#3f4c5a", fontSize: "15px", lineHeight: "25px", margin: "0 0 16px" };
const detailBox = {
  border: "1px solid #dbe5ef",
  borderLeft: `4px solid ${BRAND_LIGHT}`,
  borderRadius: "12px",
  backgroundColor: "#f5f9fd",
  padding: "18px 20px",
  margin: "20px 0",
};
const detailLabel = {
  color: BRAND_LIGHT,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  margin: "0 0 2px",
};
const detailValue = {
  color: "#16283a",
  fontSize: "15px",
  fontWeight: 600,
  margin: "0 0 14px",
};
const note = { color: "#6b7a8c", fontSize: "13px", lineHeight: "20px", margin: "0 0 8px" };
const hr = { borderColor: "#e2eaf3", margin: "26px 0 18px" };
const footer = {
  backgroundColor: "#f5f9fd",
  padding: "20px 32px",
  borderTop: "1px solid #dbe5ef",
};
const footerText = { color: "#6b7a8c", fontSize: "12px", lineHeight: "19px", margin: "0 0 4px" };
const footerLink = { color: BRAND_DEEP, fontSize: "12px", fontWeight: 600 };

const Detail = ({ label, value }: { label: string; value?: string | null }) =>
  value ? (
    <>
      <Text style={detailLabel}>{label}</Text>
      <Text style={detailValue}>{value}</Text>
    </>
  ) : null;

const RequestReceivedEmail = ({
  fullName,
  organizationName = "Pacific Health Group",
  referenceId,
  requestType = "request",
  serviceInterest,
  county,
  preferredLanguage,
  message,
  afterHours = false,
  responseTime,
  logoUrl,
  primaryColor,
  supportUrl = "https://mypacifichealth.com",
  supportPhone = "(888) 341-4449",
  crisisPhone = "1-877-811-1217",
}: Props) => {
  const accent = primaryColor || BRAND_DEEP;
  const expectation =
    responseTime ||
    (afterHours ? "on our next business day" : "within one business day, and usually much sooner");
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        We received your {requestType} — a representative from {organizationName} will contact you.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Section style={brandBar}>
              {logoUrl ? <Img src={logoUrl} alt={organizationName} style={logoImg} /> : null}
              <Text style={logoUrl ? { ...brandText, margin: "14px 0 0" } : brandText}>
                {organizationName}
              </Text>
              <Text style={brandSub}>We received your request</Text>
            </Section>

            <Section style={inner}>
              <Heading style={{ ...heading, color: accent }}>
                Thank you{fullName ? `, ${fullName}` : ""}
              </Heading>
              <Text style={paragraph}>
                We have received your {requestType} and a representative from {organizationName}{" "}
                will contact you {expectation}. There is nothing else you need to do right now —
                this message is your confirmation.
              </Text>
              {afterHours ? (
                <Text style={paragraph}>
                  You reached us outside our normal hours, so our team will follow up when we
                  reopen.
                </Text>
              ) : null}

              <Section style={detailBox}>
                <Detail label="Reference" value={referenceId} />
                <Detail label="Request" value={requestType} />
                <Detail label="Service" value={serviceInterest} />
                <Detail label="County" value={county} />
                <Detail label="Preferred language" value={preferredLanguage} />
                {message ? (
                  <>
                    <Text style={detailLabel}>What you told us</Text>
                    <Text style={{ ...detailValue, margin: "0", fontWeight: 400 }}>{message}</Text>
                  </>
                ) : null}
              </Section>

              <Hr style={hr} />

              <Text style={note}>
                Need to reach us sooner? Call{" "}
                <Link href={`tel:${supportPhone.replace(/[^\d+]/g, "")}`} style={footerLink}>
                  {supportPhone}
                </Link>{" "}
                and mention your reference number.
              </Text>
              <Text style={note}>
                If this is a medical emergency, call 911. For behavioral health support at any hour,
                call{" "}
                <Link href={`tel:${crisisPhone.replace(/[^\d+]/g, "")}`} style={footerLink}>
                  {crisisPhone}
                </Link>
                .
              </Text>
              <Text style={note}>
                Please do not reply with medical details by email — email is not a secure way to
                share health information.
              </Text>
            </Section>

            <Section style={footer}>
              <Text style={footerText}>
                {organizationName} ·{" "}
                <Link href={`tel:${supportPhone.replace(/[^\d+]/g, "")}`} style={footerLink}>
                  {supportPhone}
                </Link>
              </Text>
              <Text style={footerText}>
                <Link href={supportUrl} style={footerLink}>
                  {supportUrl.replace(/^https?:\/\//, "")}
                </Link>
              </Text>
              <Text style={footerText}>
                You are receiving this message because you asked us to contact you.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export const template: TemplateEntry = {
  component: RequestReceivedEmail,
  displayName: "Request received (visitor confirmation)",
  subject: (data) =>
    `We received your request${data?.referenceId ? ` (${data.referenceId})` : ""} — ${
      data?.organizationName || "Pacific Health Group"
    }`,
  previewData: {
    fullName: "Maria Lopez",
    organizationName: "Pacific Health Group",
    referenceId: "PHG-4F2A91",
    requestType: "callback request",
    serviceInterest: "Care coordination",
    county: "Los Angeles",
    preferredLanguage: "Spanish",
    message: "I would like help understanding my transportation benefit.",
    afterHours: false,
    logoUrl:
      "https://chat.mypacifichealth.com/__l5e/assets-v1/a3b250ac-f23a-4271-8d40-1f9118b44656/phg-logo-light.png",
  },
};

export default RequestReceivedEmail;
