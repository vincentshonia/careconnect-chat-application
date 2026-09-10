import React from 'react'
import {
  Body,
  Button,
  Img,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  fullName?: string
  organizationName?: string
  email?: string
  inviteUrl?: string
  expiresAt?: string
  role?: string
  logoUrl?: string
  primaryColor?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px 24px' }
const brandBarBase = {
  borderRadius: '12px',
  padding: '22px 24px',
}
const defaultBrandBackground =
  'linear-gradient(90deg, #12839b 0%, #4f46e5 55%, #a734b8 100%)'
const logoImg = { maxHeight: '40px', maxWidth: '200px', display: 'block' }
const brandText = { color: '#ffffff', fontSize: '18px', fontWeight: 700, margin: '0' }
const brandSub = { color: '#e6f4f7', fontSize: '13px', margin: '6px 0 0' }
const heading = { color: '#0f172a', fontSize: '22px', margin: '28px 0 8px' }
const paragraph = { color: '#334155', fontSize: '15px', lineHeight: '24px', margin: '0 0 14px' }
const credBox = {
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  backgroundColor: '#f8fafc',
  padding: '18px 20px',
  margin: '18px 0',
}
const credLabel = {
  color: '#64748b',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  margin: '0 0 2px',
}
const credValue = {
  color: '#0f172a',
  fontSize: '15px',
  fontFamily: 'Menlo, Consolas, monospace',
  margin: '0 0 14px',
}
const button = {
  backgroundColor: '#12839b',
  color: '#ffffff',
  borderRadius: '10px',
  padding: '12px 22px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
const note = { color: '#64748b', fontSize: '13px', lineHeight: '20px', margin: '0 0 8px' }
const hr = { borderColor: '#e2e8f0', margin: '26px 0' }

const StaffWelcomeEmail = ({
  fullName,
  organizationName = 'your care team',
  email,
  inviteUrl = 'https://chat.mypacifichealth.com/invite',
  expiresAt,
  role,
  logoUrl,
  primaryColor,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You have been invited to CareConnect — accept your invitation</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section
          style={{
            ...brandBarBase,
            background: primaryColor || defaultBrandBackground,
          }}
        >
          {logoUrl ? (
            <Img src={logoUrl} alt={organizationName} style={logoImg} />
          ) : (
            <Text style={brandText}>CareConnect</Text>
          )}
          <Text style={logoUrl ? { ...brandSub, margin: '10px 0 0' } : brandSub}>
            {organizationName}
          </Text>
        </Section>

        <Heading style={heading}>Welcome{fullName ? `, ${fullName}` : ''} 👋</Heading>
        <Text style={paragraph}>
          You have been invited to CareConnect, the communication workspace for{' '}
          {organizationName}. Use the invitation link below to set up your own sign-in — no
          password is ever sent by email.
        </Text>

        <Section style={credBox}>
          <Text style={credLabel}>Email</Text>
          <Text style={credValue}>{email ?? '—'}</Text>
          {role ? (
            <>
              <Text style={credLabel}>Role</Text>
              <Text style={{ ...credValue, margin: '0' }}>{role.replace(/_/g, ' ')}</Text>
            </>
          ) : null}
        </Section>

        <Section>
          <Button href={inviteUrl} style={{ ...button, backgroundColor: primaryColor || button.backgroundColor }}>
            Accept your invitation
          </Button>
        </Section>

        <Hr style={hr} />

        <Text style={note}>
          This invitation can be used once, only by this email address, and
          {expiresAt ? ` expires on ${new Date(expiresAt).toLocaleDateString('en-US')}.` : ' expires automatically.'}
        </Text>
        <Text style={note}>
          If you weren't expecting this invitation, please contact your administrator and do not
          use the link above.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: StaffWelcomeEmail,
  subject: 'Welcome to CareConnect — accept your invitation',
  displayName: 'Staff welcome',
  previewData: {
    fullName: 'Maria Lopez',
    organizationName: 'Pacific Health Group',
    email: 'maria@example.com',
    inviteUrl: 'https://chat.mypacifichealth.com/invite?t=example-token',
    expiresAt: '2026-09-16T00:00:00.000Z',
    role: 'agent',
    primaryColor: '#0f766e',
  },
} satisfies TemplateEntry
