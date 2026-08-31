import React from 'react'
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
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  fullName?: string
  organizationName?: string
  email?: string
  tempPassword?: string
  signInUrl?: string
  role?: string
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Helvetica, Arial, sans-serif' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '32px 24px' }
const brandBar = {
  background: 'linear-gradient(90deg, #12839b 0%, #4f46e5 55%, #a734b8 100%)',
  borderRadius: '12px',
  padding: '22px 24px',
}
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
  tempPassword,
  signInUrl = 'https://chat.mypacifichealth.com/auth',
  role,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your CareConnect account is ready — here is your temporary password</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brandBar}>
          <Text style={brandText}>CareConnect</Text>
          <Text style={brandSub}>Pacific Health Group</Text>
        </Section>

        <Heading style={heading}>Welcome{fullName ? `, ${fullName}` : ''} 👋</Heading>
        <Text style={paragraph}>
          An account has been created for you on CareConnect, the communication workspace for{' '}
          {organizationName}. You can sign in right away with the temporary credentials below.
        </Text>

        <Section style={credBox}>
          <Text style={credLabel}>Email</Text>
          <Text style={credValue}>{email ?? '—'}</Text>
          <Text style={credLabel}>Temporary password</Text>
          <Text style={credValue}>{tempPassword ?? '—'}</Text>
          {role ? (
            <>
              <Text style={credLabel}>Role</Text>
              <Text style={{ ...credValue, margin: '0' }}>{role.replace(/_/g, ' ')}</Text>
            </>
          ) : null}
        </Section>

        <Section>
          <Button href={signInUrl} style={button}>
            Sign in to CareConnect
          </Button>
        </Section>

        <Hr style={hr} />

        <Text style={note}>
          For your security, change this temporary password immediately after your first sign-in.
        </Text>
        <Text style={note}>
          If you weren't expecting this invitation, please contact your administrator and do not
          use the credentials above.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: StaffWelcomeEmail,
  subject: 'Welcome to CareConnect — your account is ready',
  displayName: 'Staff welcome',
  previewData: {
    fullName: 'Maria Lopez',
    organizationName: 'Pacific Health Group',
    email: 'maria@example.com',
    tempPassword: 'Ph!TempPassw0rd9',
    signInUrl: 'https://chat.mypacifichealth.com/auth',
    role: 'agent',
  },
} satisfies TemplateEntry
