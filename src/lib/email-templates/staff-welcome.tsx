import React from "react";
import {
  Body,
  Button,
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
  fullName?: string;
  organizationName?: string;
  email?: string;
  inviteUrl?: string;
  expiresAt?: string;
  role?: string;
  logoUrl?: string;
  primaryColor?: string;
  supportUrl?: string;
  supportPhone?: string;
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
const credBox = {
  border: "1px solid #dbe5ef",
  borderLeft: `4px solid ${BRAND_LIGHT}`,
  borderRadius: "12px",
  backgroundColor: "#f5f9fd",
  padding: "18px 20px",
  margin: "20px 0",
};
const credLabel = {
  color: BRAND_LIGHT,
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase" as const,
  margin: "0 0 2px",
};
const credValue = {
  color: "#16283a",
  fontSize: "15px",
  fontWeight: 600,
  margin: "0 0 14px",
};
const button = {
  backgroundColor: BRAND_DEEP,
  color: "#ffffff",
  borderRadius: "10px",
  padding: "14px 26px",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  display: "inline-block",
};
const linkFallback = {
  color: BRAND_LIGHT,
  fontSize: "12px",
  wordBreak: "break-all" as const,
  margin: "12px 0 0",
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

const StaffWelcomeEmail = ({
  fullName,
  organizationName = "your care team",
  email,
  inviteUrl = "https://chat.mypacifichealth.com/invite",
  expiresAt,
  role,
  logoUrl,
  primaryColor,
  supportUrl = "https://mypacifichealth.com",
  supportPhone = "(888) 341-4449",
}: Props) => {
  const accent = primaryColor || BRAND_DEEP;
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>Your CareConnect invitation for {organizationName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Section style={brandBar}>
              {logoUrl ? (
                <Img src={logoUrl} alt={organizationName} style={logoImg} />
              ) : null}
              <Text style={logoUrl ? { ...brandText, margin: "14px 0 0" } : brandText}>
                CareConnect
              </Text>
              <Text style={brandSub}>{organizationName}</Text>
            </Section>

            <Section style={inner}>
              <Heading style={heading}>Welcome{fullName ? `, ${fullName}` : ""}</Heading>
              <Text style={paragraph}>
                You have been invited to CareConnect, the member communication workspace for{" "}
                {organizationName}. Use the secure invitation link below to create your own sign-in
                — we never send passwords by email.
              </Text>

              <Section style={credBox}>
                <Text style={credLabel}>Email</Text>
                <Text style={credValue}>{email ?? "—"}</Text>
                {role ? (
                  <>
                    <Text style={credLabel}>Role</Text>
                    <Text style={{ ...credValue, margin: "0", textTransform: "capitalize" }}>
                      {role.replace(/_/g, " ")}
                    </Text>
                  </>
                ) : null}
              </Section>

              <Section>
                <Button href={inviteUrl} style={{ ...button, backgroundColor: accent }}>
                  Accept your invitation
                </Button>
                <Text style={linkFallback}>
                  Button not working? Paste this link into your browser: {inviteUrl}
                </Text>
              </Section>

              <Hr style={hr} />

              <Text style={note}>
                This invitation can be used once, only by this email address, and
                {expiresAt
                  ? ` expires on ${new Date(expiresAt).toLocaleDateString("en-US")}.`
                  : " expires automatically."}
              </Text>
              <Text style={note}>
                If you weren't expecting this invitation, please contact your administrator and do
                not use the link above.
              </Text>
            </Section>

            <Section style={footer}>
              <Text style={footerText}>
                {organizationName} · Questions? Call{" "}
                <Link href={`tel:${supportPhone.replace(/[^\d+]/g, "")}`} style={footerLink}>
                  {supportPhone}
                </Link>
              </Text>
              <Text style={footerText}>
                <Link href={supportUrl} style={footerLink}>
                  {supportUrl.replace(/^https?:\/\//, "")}
                </Link>
              </Text>
              <Text style={{ ...footerText, margin: "8px 0 0" }}>
                This message was sent to a staff member of {organizationName}. Please do not forward
                the invitation link.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export const template = {
  component: StaffWelcomeEmail,
  subject: "Welcome to CareConnect — accept your invitation",
  displayName: "Staff welcome",
  previewData: {
    fullName: "Maria Lopez",
    organizationName: "Pacific Health Group",
    email: "maria@example.com",
    inviteUrl: "https://chat.mypacifichealth.com/invite?t=example-token",
    expiresAt: "2026-09-16T00:00:00.000Z",
    role: "agent",
    logoUrl: "https://chat.mypacifichealth.com/__l5e/assets-v1/a3b250ac-f23a-4271-8d40-1f9118b44656/phg-logo-light.png",
  },
} satisfies TemplateEntry;
