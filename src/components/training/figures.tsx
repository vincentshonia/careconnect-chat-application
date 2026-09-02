/**
 * Annotated interface illustrations used across the Training Center.
 *
 * These are diagrams of the real console — same tokens, same wording, same
 * layout — with numbered markers that the surrounding guide text refers to.
 * They are deliberately not screenshots: a screenshot would leak tenant data,
 * go stale after a branding change and be unreadable in the printed handout.
 */
import type { ReactNode } from "react";
import type { FigureId } from "@/lib/training/types";
import {
  MockBadge,
  MockBubbles,
  MockButton,
  MockColumns,
  MockField,
  MockFrame,
  MockList,
  MockPanel,
  MockPills,
  MockScreen,
  MockStat,
  MockStatRow,
  MockTable,
  Marker,
} from "./mock/kit";

export type TrainingFigure = {
  /** Short caption shown above the illustration. */
  title: string;
  /** Screen-reader description of what the illustration shows. */
  alt: string;
  /** Legend text for markers 1..n, in order. */
  markers: string[];
  render: () => ReactNode;
};

const AGENT_NAV = [
  "Dashboard",
  "Inbox",
  "Intake",
  "Contacts",
  "Notifications",
  "My settings",
  "Knowledge",
  "Training",
] as const;

const LEAD_NAV = [
  "Dashboard",
  "Inbox",
  "Intake",
  "Contacts",
  "Knowledge",
  "Quality & QA",
  "Reports",
  "Staff",
] as const;

const ADMIN_NAV = [
  "Dashboard",
  "Inbox",
  "Reports",
  "Websites",
  "Departments",
  "Routing",
  "Staff",
  "Settings",
  "Security",
  "Audit log",
] as const;

export const FIGURES: Record<FigureId, TrainingFigure> = {
  "sign-in": {
    title: "The CareConnect sign-in screen",
    alt: "Sign-in card with a Continue with Google button, email and password fields, a Sign in button and a Forgot your password link.",
    markers: [
      "Continue with Google — the fastest route if your work account is a Google account.",
      "Work email and password — the details an administrator gave you.",
      "Sign in — submits the form.",
      "Forgot your password? — emails you a reset link.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/auth">
        <div className="mx-auto max-w-[340px] space-y-2 p-4">
          <p className="text-center text-[11px] font-semibold">CareConnect</p>
          <p className="text-center text-[9px] text-muted-foreground">
            Sign in to the support console
          </p>
          <div className="rounded-lg border border-border bg-card p-2">
            <MockButton tone="outline" marker={1}>
              Continue with Google
            </MockButton>
            <p className="my-1.5 text-center text-[8px] text-muted-foreground">
              or sign in with email
            </p>
            <div className="space-y-1.5">
              <MockField label="Email" value="you@mypacifichealth.com" marker={2} />
              <MockField label="Password" value="••••••••••" />
              <div className="flex items-center justify-between pt-0.5">
                <MockButton marker={3}>Sign in</MockButton>
                <span className="flex items-center gap-1 text-[9px] text-primary underline">
                  <Marker n={4} />
                  Forgot your password?
                </span>
              </div>
            </div>
          </div>
        </div>
      </MockFrame>
    ),
  },

  "console-tour": {
    title: "The console at a glance",
    alt: "Console layout showing the branded sidebar with grouped navigation, a page header with title and description, an alert bell and the main content area.",
    markers: [
      "Your organization's logo or name. Selecting it returns you to the console home.",
      "Navigation groups: Workspace, Content & AI, and Configuration. You only see items your role allows.",
      "Red count badges: Inbox shows conversations waiting for a response, Notifications shows your unread alerts.",
      "Page title and one-line description of the screen you are on.",
      "Alert bell — opens Notifications from anywhere.",
      "Bottom of the sidebar: theme switch, Collapse, and Sign out.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/dashboard">
        <div className="flex min-h-[230px]">
          <div className="sidebar-aurora hidden w-[150px] shrink-0 flex-col justify-between p-2 text-sidebar-foreground sm:flex">
            <div className="space-y-2">
              <p className="flex items-center gap-1 px-1 text-[10px] font-semibold">
                <Marker n={1} /> Pacific Health
              </p>
              <div>
                <p className="flex items-center gap-1 px-1 text-[8px] uppercase tracking-wider text-sidebar-foreground/50">
                  <Marker n={2} /> Workspace
                </p>
                <ul className="mt-0.5 space-y-0.5 text-[9px]">
                  <li className="gradient-brand rounded-lg px-2 py-1 font-semibold text-sidebar-primary-foreground">
                    Dashboard
                  </li>
                  <li className="flex items-center justify-between rounded-lg px-2 py-1 text-sidebar-foreground/70">
                    Inbox
                    <span className="flex items-center gap-1">
                      <Marker n={3} />
                      <span className="rounded-full bg-destructive px-1 text-[8px] font-semibold text-destructive-foreground">
                        3
                      </span>
                    </span>
                  </li>
                  <li className="rounded-lg px-2 py-1 text-sidebar-foreground/70">Intake</li>
                  <li className="rounded-lg px-2 py-1 text-sidebar-foreground/70">Contacts</li>
                  <li className="rounded-lg px-2 py-1 text-sidebar-foreground/70">Notifications</li>
                </ul>
              </div>
              <div>
                <p className="px-1 text-[8px] uppercase tracking-wider text-sidebar-foreground/50">
                  Content &amp; AI
                </p>
                <ul className="mt-0.5 space-y-0.5 text-[9px] text-sidebar-foreground/70">
                  <li className="rounded-lg px-2 py-1">Knowledge</li>
                  <li className="rounded-lg px-2 py-1">Reports</li>
                </ul>
              </div>
            </div>
            <ul className="space-y-0.5 border-t border-sidebar-border pt-1.5 text-[9px] text-sidebar-foreground/70">
              <li className="flex items-center gap-1 rounded-lg px-2 py-1">
                <Marker n={6} /> Dark mode
              </li>
              <li className="rounded-lg px-2 py-1">Collapse</li>
              <li className="rounded-lg px-2 py-1">Sign out</li>
            </ul>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2 border-b border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[11px] font-semibold">
                  <Marker n={4} /> Dashboard
                </p>
                <p className="truncate text-[9px] text-muted-foreground">
                  Your workload, performance and what needs attention right now.
                </p>
              </div>
              <span className="flex items-center gap-1 rounded-md border border-border px-1.5 py-1 text-[9px]">
                <Marker n={5} /> Alerts
              </span>
            </div>
            <div className="space-y-2 p-3">
              <MockStatRow>
                <MockStat label="My open" value="4" />
                <MockStat label="Waiting" value="2" tone="warn" />
                <MockStat label="Completed today" value="11" tone="good" />
                <MockStat label="SLA risk" value="0" />
              </MockStatRow>
              <MockPanel title="Needs my attention">
                <MockList
                  items={[
                    { title: "Website visitor — Coverage question", meta: "Waiting 6m" },
                    { title: "M. Ruiz — Transport benefit", meta: "Follow-up due" },
                  ]}
                />
              </MockPanel>
            </div>
          </div>
        </div>
      </MockFrame>
    ),
  },

  "dashboard-self": {
    title: "Dashboard — Standard User view",
    alt: "Dashboard for a standard user showing a greeting with role badge and availability selector, personal counters, the Needs my attention panel and the Available conversations queue.",
    markers: [
      "Greeting, your role badge, and the Availability selector (Available, Busy, Away, Offline).",
      "Right now — your own live counters plus what is waiting in your departments.",
      "Needs my attention — ordered by urgency: waiting visitors, SLA risk, escalations, follow-ups.",
      "My performance — your numbers for the selected period, with a period selector.",
      "Available conversations — waiting visitors you are eligible to claim, each with a Claim button.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/dashboard">
        <MockScreen
          nav={AGENT_NAV}
          navActive="Dashboard"
          title="Dashboard"
          description="Your workload, performance and what needs attention right now."
          actions={
            <span className="flex items-center gap-1">
              <Marker n={1} />
              <MockBadge>Standard User</MockBadge>
              <MockButton tone="outline">Available</MockButton>
            </span>
          }
        >
          <MockPanel title="Right now" marker={2}>
            <MockStatRow>
              <MockStat label="My open" value="4" />
              <MockStat label="My active" value="2" />
              <MockStat label="Waiting in my department" value="3" tone="warn" />
              <MockStat label="Completed today" value="9" tone="good" />
            </MockStatRow>
          </MockPanel>
          <MockColumns>
            <MockPanel
              title="Needs my attention"
              description="Ordered by urgency."
              marker={3}
            >
              <MockList
                items={[
                  {
                    title: "Website visitor — Ride to dialysis",
                    meta: "Waiting for a human · 7m · Enrollment",
                  },
                  { title: "A. Chen — Plan change", meta: "Follow-up · 2h · Care Management" },
                ]}
              />
            </MockPanel>
            <MockPanel title="My performance" description="This week" marker={4}>
              <MockTable
                head={["Metric", "Value"]}
                rows={[
                  ["Conversations handled", "38"],
                  ["Avg. first response", "1.4m"],
                  ["SLA compliance", "96%"],
                  ["Visitor satisfaction", "4.7 / 5"],
                ]}
              />
            </MockPanel>
          </MockColumns>
          <MockPanel
            title="Available conversations"
            description="Waiting visitors you are eligible to claim."
            marker={5}
            actions={<MockButton>Claim</MockButton>}
          >
            <MockList
              items={[
                {
                  title: "Website visitor — Community Supports",
                  meta: "Waiting 3m · Enrollment",
                  badge: "Agent requested",
                },
              ]}
            />
          </MockPanel>
        </MockScreen>
      </MockFrame>
    ),
  },

  "dashboard-team": {
    title: "Dashboard — Team Lead and Manager view",
    alt: "Team-scoped dashboard adding department queue health, staff availability and a team workload table below the personal panels.",
    markers: [
      "Your personal counters stay at the top — you are still an owner of conversations.",
      "Staff availability — live presence counts for the people in your departments.",
      "My departments — queue health per department: open, waiting, oldest waiting, SLA risk, CSAT.",
      "My team today — presence, live workload and outcomes per teammate. Selecting a row opens the full report.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/dashboard">
        <MockScreen
          nav={LEAD_NAV}
          navActive="Dashboard"
          title="Dashboard"
          description="Your workload, performance and what needs attention right now."
          actions={<MockBadge>Team Lead</MockBadge>}
        >
          <MockPanel title="Right now" marker={1}>
            <MockStatRow>
              <MockStat label="My open" value="2" />
              <MockStat label="Waiting in my department" value="5" tone="warn" />
              <MockStat label="Completed today" value="24" tone="good" />
              <MockStat label="SLA risk" value="1" tone="warn" />
            </MockStatRow>
          </MockPanel>
          <MockPanel title="Staff availability" description="Live presence across your scope." marker={2}>
            <MockStatRow>
              <MockStat label="Available" value="6" tone="good" />
              <MockStat label="Busy" value="2" />
              <MockStat label="Away" value="1" />
              <MockStat label="At capacity" value="1" tone="warn" />
            </MockStatRow>
          </MockPanel>
          <MockPanel title="My departments" description="Queue health for the period." marker={3}>
            <MockTable
              head={["Department", "Open", "Waiting", "Oldest", "SLA %"]}
              rows={[
                ["Enrollment", "9", "3", "12m", "94%"],
                ["Care Management", "4", "1", "4m", "100%"],
              ]}
            />
          </MockPanel>
          <MockPanel title="My team today" description="Presence, workload and outcomes." marker={4}>
            <MockTable
              head={["Staff", "Presence", "Active / capacity", "Completed"]}
              rows={[
                ["M. Lopez", "available", "2 / 4", "11"],
                ["J. Park", "busy", "4 / 4", "8"],
              ]}
            />
          </MockPanel>
        </MockScreen>
      </MockFrame>
    ),
  },

  "dashboard-org": {
    title: "Dashboard — Administrator and Super Admin view",
    alt: "Organization-scoped dashboard showing organization-wide live counters, department performance, agent workload and the organization overview panel.",
    markers: [
      "Right now — organization-wide live counters: Open, Waiting, Unassigned, Active, Agent requested, Completed today, SLA risk, Open intakes.",
      "Every counter is a link: selecting one opens the Inbox or Intake already filtered to those records.",
      "Department performance — all departments in the tenant, not just yours.",
      "Organization overview and AI vs human assistance — historical totals for the selected period.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/dashboard">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Dashboard"
          title="Dashboard"
          description="Your workload, performance and what needs attention right now."
          actions={<MockBadge>Administrator</MockBadge>}
        >
          <MockPanel title="Right now" marker={1}>
            <MockStatRow>
              <MockStat label="Open" value="37" marker={2} />
              <MockStat label="Waiting" value="6" tone="warn" />
              <MockStat label="Unassigned" value="4" />
              <MockStat label="Active" value="12" />
            </MockStatRow>
            <div className="mt-1.5">
              <MockStatRow>
                <MockStat label="Agent requested" value="3" tone="warn" />
                <MockStat label="Completed today" value="88" tone="good" />
                <MockStat label="SLA risk" value="2" tone="warn" />
                <MockStat label="Open intakes" value="19" />
              </MockStatRow>
            </div>
          </MockPanel>
          <MockPanel title="Department performance" marker={3}>
            <MockTable
              head={["Department", "Total", "Open", "Avg response", "SLA %", "CSAT"]}
              rows={[
                ["Enrollment", "412", "9", "1.8m", "93%", "4.6"],
                ["Care Management", "268", "4", "1.2m", "98%", "4.8"],
                ["Transportation", "97", "2", "2.4m", "88%", "4.4"],
              ]}
            />
          </MockPanel>
          <MockColumns>
            <MockPanel title="Organization overview" marker={4}>
              <MockTable
                head={["Metric", "Value"]}
                rows={[
                  ["Total conversations", "777"],
                  ["Human assistance requests", "231"],
                  ["Avg. first response", "1.6m"],
                  ["Visitor satisfaction", "4.6 / 5"],
                ]}
              />
            </MockPanel>
            <MockPanel title="AI vs human assistance">
              <MockTable
                head={["Measure", "Value"]}
                rows={[
                  ["AI handled", "70%"],
                  ["Human assisted", "30%"],
                  ["Escalation rate", "30%"],
                ]}
              />
            </MockPanel>
          </MockColumns>
        </MockScreen>
      </MockFrame>
    ),
  },

  inbox: {
    title: "Inbox — three-column layout",
    alt: "Inbox with queue tabs and search in the header, a conversation list on the left, the transcript in the middle with action buttons, the reply box at the bottom and visitor details on the right.",
    markers: [
      "Queue tabs: Waiting, Mine, Department, Active, Closed — plus All conversations for roles that can see everything.",
      "Search by reference or subject.",
      "Conversation list: subject, status badge, who owns it, reference and last activity.",
      "Header actions: Claim conversation, Resolve, Close — and Transfer to… for roles that can transfer.",
      "Transcript: visitor messages on the left, AI answers as outlined cards, your replies on the right.",
      "Reply box. Enter sends, Shift+Enter starts a new line.",
      "Visitor details captured by the widget for this conversation.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/inbox">
        <MockScreen
          nav={AGENT_NAV}
          navActive="Inbox"
          title="Inbox"
          description="Website chat conversations, AI answers, and live agent replies."
          actions={
            <span className="flex flex-wrap items-center gap-1">
              <MockField label="Search" value="Search reference or subject" marker={2} />
            </span>
          }
        >
          <MockPills
            items={["Waiting", "Mine", "Department", "Active", "Closed"]}
            active="Waiting"
            marker={1}
          />
          <div className="grid gap-2 lg:grid-cols-[130px_minmax(0,1fr)_110px]">
            <MockList
              marker={3}
              items={[
                { title: "Ride to dialysis", meta: "PHG-2041 · 3m ago", badge: "Waiting" },
                { title: "Plan change", meta: "PHG-2039 · 12m ago", badge: "Claimed" },
                { title: "Website chat", meta: "PHG-2038 · 1h ago", badge: "Active" },
              ]}
            />
            <MockPanel
              title="Ride to dialysis"
              description="normal · Waiting for human"
              actions={
                <span className="flex gap-1">
                  <MockButton marker={4}>Claim conversation</MockButton>
                </span>
              }
            >
              <MockBubbles
                marker={5}
                messages={[
                  { from: "visitor", text: "Can you help me get a ride to dialysis?" },
                  {
                    from: "ai",
                    text: "Transportation support may be available through Community Supports…",
                  },
                  { from: "visitor", text: "I'd like to talk to a person." },
                ]}
              />
              <div className="mt-2 rounded-md border border-border p-1.5">
                <p className="flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Marker n={6} />
                  Reply to the visitor… (Enter to send, Shift+Enter for a new line)
                </p>
                <div className="mt-1 flex justify-end">
                  <MockButton>Send reply</MockButton>
                </div>
              </div>
            </MockPanel>
            <MockPanel title="Visitor details" marker={7}>
              <p className="text-[9px] text-muted-foreground">full name</p>
              <p className="text-[9px]">Maria R.</p>
              <p className="mt-1 text-[9px] text-muted-foreground">county</p>
              <p className="text-[9px]">Los Angeles</p>
            </MockPanel>
          </div>
        </MockScreen>
      </MockFrame>
    ),
  },

  "inbox-transfer": {
    title: "Moving a conversation to the right person",
    alt: "Inbox header showing the Transfer to department selector next to the Reassign button, and the Reassign dialog listing eligible teammates with presence, capacity and an Assign button.",
    markers: [
      "Transfer to… — moves the conversation to another department queue and notifies that department.",
      "Reassign — opens the teammate picker for the conversation's current department.",
      "Each candidate shows presence, current load against capacity and their departments.",
      "Assign hands the conversation over. Ineligible teammates show the reason instead.",
      "Return to the department queue releases the conversation so anyone eligible can claim it.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/inbox">
        <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-2">
            <span className="text-[10px] font-medium">Ride to dialysis</span>
            <MockBadge tone="muted">Claimed</MockBadge>
            <span className="ml-auto flex items-center gap-1">
              <MockButton tone="outline" marker={1}>
                Transfer to…
              </MockButton>
              <MockButton tone="outline" marker={2}>
                Reassign
              </MockButton>
            </span>
          </div>
          <MockPanel
            title="Reassign conversation"
            description="Only teammates in this conversation's department with a chat-handling role are listed."
          >
            <ul className="space-y-1">
              <li className="flex items-center justify-between gap-2 rounded-md border border-border p-1.5">
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-[9px] font-medium">
                    <Marker n={3} /> M. Lopez <MockBadge tone="good">available</MockBadge>
                  </span>
                  <span className="block text-[8px] text-muted-foreground">
                    Enrollment · team lead · 2 active / 4
                  </span>
                </span>
                <MockButton marker={4}>Assign</MockButton>
              </li>
              <li className="flex items-center justify-between gap-2 rounded-md border border-border p-1.5">
                <span className="min-w-0">
                  <span className="text-[9px] font-medium">J. Park</span>
                  <span className="block text-[8px] text-muted-foreground">
                    Enrollment · agent · at capacity
                  </span>
                </span>
                <MockButton tone="outline">Override…</MockButton>
              </li>
            </ul>
            <p className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
              <Marker n={5} /> Return to the department queue
            </p>
          </MockPanel>
        </div>
      </MockFrame>
    ),
  },

  intake: {
    title: "Referrals & enrollments",
    alt: "Intake screen with search, type chips, stage tiles, a table of requests and a detail panel with stage, owner, due date, notes and activity.",
    markers: [
      "Search by name, reference or email, and Export CSV for the current filters.",
      "Type chips: All, referral, enrollment, general, callback.",
      "Stage tiles with live counts — selecting one filters the table.",
      "Request table: Reference, Name, Type, Stage, Created.",
      "Detail panel: Stage and Assigned to selectors, Due date, Add note and the Activity history.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/intake">
        <MockScreen
          nav={AGENT_NAV}
          navActive="Intake"
          title="Referrals & enrollments"
          description="Every intake from the widget, tracked from first contact to a final decision."
          actions={<MockButton tone="outline">Export CSV</MockButton>}
        >
          <MockField label="Search" value="Search name, reference, email…" marker={1} />
          <MockPills
            items={["All (42)", "referral", "enrollment", "general", "callback"]}
            active="All (42)"
            marker={2}
          />
          <MockStatRow>
            <MockStat label="New" value="7" marker={3} />
            <MockStat label="In review" value="11" />
            <MockStat label="Contacted" value="9" />
            <MockStat label="Eligibility check" value="6" />
          </MockStatRow>
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]">
            <MockTable
              marker={4}
              head={["Reference", "Name", "Type", "Stage"]}
              rows={[
                ["INT-1042", "Maria R.", "referral", "new"],
                ["INT-1041", "David C.", "enrollment", "in review"],
                ["INT-1039", "Ana G.", "callback", "contacted"],
              ]}
            />
            <MockPanel title="INT-1042" marker={5}>
              <div className="space-y-1">
                <MockField label="Stage" value="in review" />
                <MockField label="Assigned to" value="M. Lopez" />
                <MockField label="Due date" value="2026-09-05" />
                <MockButton tone="outline">Save note</MockButton>
              </div>
            </MockPanel>
          </div>
        </MockScreen>
      </MockFrame>
    ),
  },

  contacts: {
    title: "Contacts directory",
    alt: "Contacts screen with search and status filter, a contact list, and a record panel showing details, lead status buttons, staff notes and linked conversations.",
    markers: [
      "Search across name, email, phone, county, health plan and service interest.",
      "Lead status filter: All statuses, new, working, qualified, converted, closed.",
      "Contact list with the current lead status on each row.",
      "Record details captured by the widget — only fields the visitor actually provided appear.",
      "Lead status buttons and Staff notes (internal only — visitors never see them).",
      "Linked conversations and intake requests for this person.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/contacts">
        <MockScreen
          nav={AGENT_NAV}
          navActive="Contacts"
          title="Contacts"
          description="People captured through chat, referrals and enrollment forms."
          actions={<MockButton tone="outline">Export CSV</MockButton>}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <MockField label="Search" value="Search name, email, county…" marker={1} />
            <MockField label="Lead status" value="All statuses" marker={2} />
          </div>
          <div className="grid gap-2 md:grid-cols-[150px_minmax(0,1fr)]">
            <MockList
              marker={3}
              items={[
                { title: "Maria R.", meta: "maria@example.com · LA", badge: "working" },
                { title: "David C.", meta: "(555) 010-2233", badge: "new" },
              ]}
            />
            <MockPanel title="Maria R." marker={4}>
              <MockTable
                head={["Field", "Value"]}
                rows={[
                  ["County", "Los Angeles"],
                  ["Health plan", "Medi-Cal"],
                  ["Service interest", "Transportation"],
                ]}
              />
              <div className="mt-1.5">
                <MockPills
                  items={["new", "working", "qualified", "converted", "closed"]}
                  active="working"
                  marker={5}
                />
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                <Marker n={6} /> Conversations · Intake requests
              </p>
            </MockPanel>
          </div>
        </MockScreen>
      </MockFrame>
    ),
  },

  notifications: {
    title: "Notifications and alert preferences",
    alt: "Notifications screen with a waiting-conversations banner, desktop alert card, alert feed and a preferences grid of in-app and email toggles.",
    markers: [
      "Waiting banner — how many chats are unclaimed right now, with a link to the Inbox.",
      "Desktop & device alerts — turn on browser pop-ups so you hear about escalations in the background.",
      "Alert feed. Unread items are highlighted; each has Open and Mark read.",
      "Alert preferences: in-app and email toggles for escalations, new referrals, SLA breaches and low ratings.",
      "First-response target in minutes — drives the SLA breach warnings you see.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/notifications">
        <MockScreen
          nav={AGENT_NAV}
          navActive="Notifications"
          title="Notifications"
          description="Everything that needs your attention, plus how you want to be alerted."
          actions={<MockButton tone="outline">Mark all read</MockButton>}
        >
          <MockPanel title="2 conversations are waiting for a human" marker={1}>
            <p className="text-[9px] text-muted-foreground">
              Unclaimed chats in your queues. Open inbox →
            </p>
          </MockPanel>
          <MockPanel title="Desktop &amp; device alerts" marker={2}>
            <MockButton tone="outline">Enable notifications</MockButton>
          </MockPanel>
          <MockList
            marker={3}
            items={[
              { title: "Escalation — PHG-2041", meta: "2 minutes ago", badge: "escalation" },
              { title: "New referral — INT-1042", meta: "18 minutes ago", badge: "new intake" },
            ]}
          />
          <MockPanel title="Alert preferences" marker={4}>
            <MockTable
              head={["Alert", "In app", "Email"]}
              rows={[
                ["Live-agent escalations", "on", "on"],
                ["New referrals & enrollments", "on", "off"],
                ["First-response SLA breaches", "on", "off"],
              ]}
            />
            <div className="mt-1.5">
              <MockField label="First-response target (minutes)" value="15" marker={5} />
            </div>
          </MockPanel>
        </MockScreen>
      </MockFrame>
    ),
  },

  profile: {
    title: "My settings",
    alt: "Personal settings page with profile photo controls, visitor visibility checkbox, personal detail fields, appearance buttons and security shortcuts.",
    markers: [
      "Profile photo — PNG or JPG up to 5 MB, with Replace and Remove.",
      "Show my name and photo to website visitors — off by default.",
      "Display name is what visitors see during a live chat.",
      "Availability — the same status the dashboard header sets.",
      "Appearance: Match device, Light, Dark.",
      "Notification preferences, Two-step verification and Send password reset email.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/profile">
        <MockScreen
          nav={AGENT_NAV}
          navActive="My settings"
          title="My settings"
          description="Your personal profile, availability, appearance and account security."
        >
          <MockColumns>
            <MockPanel title="Profile photo" marker={1}>
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-[9px]">
                  ML
                </span>
                <MockButton tone="outline">Replace photo</MockButton>
              </div>
              <p className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                <Marker n={2} /> Show my name and photo to website visitors
              </p>
            </MockPanel>
            <MockPanel title="Personal details">
              <div className="space-y-1">
                <MockField label="Display name (visitor-facing)" value="Maria from Pacific Health" marker={3} />
                <MockField label="Availability" value="Available" marker={4} />
                <MockField label="Languages spoken" value="English, Spanish" />
              </div>
            </MockPanel>
          </MockColumns>
          <MockColumns>
            <MockPanel title="Appearance" marker={5}>
              <MockPills items={["Match device", "Light", "Dark"]} active="Match device" />
            </MockPanel>
            <MockPanel title="Notifications &amp; security" marker={6}>
              <span className="flex flex-wrap gap-1">
                <MockButton tone="outline">Notification preferences</MockButton>
                <MockButton tone="outline">Two-step verification</MockButton>
              </span>
            </MockPanel>
          </MockColumns>
        </MockScreen>
      </MockFrame>
    ),
  },

  knowledge: {
    title: "Knowledge base",
    alt: "Knowledge screen with Articles and FAQs tabs, an article list with statuses and an editor with title, summary, status, content and Save and re-index.",
    markers: [
      "Tabs: Articles power the AI assistant's answers, FAQs appear in the widget.",
      "New article creates a draft called “Untitled article”.",
      "Article list with the current status badge and last update.",
      "Editor fields: Title, Summary, Status, Content.",
      "Save & re-index rewrites the AI's search index for that article. Delete removes the article and its indexed chunks.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/knowledge">
        <MockScreen
          nav={LEAD_NAV}
          navActive="Knowledge"
          title="Knowledge base"
          description="Articles feed the AI chatbot through vector search; FAQs appear in the widget."
        >
          <MockPills items={["Articles", "FAQs"]} active="Articles" marker={1} />
          <div className="grid gap-2 md:grid-cols-[150px_minmax(0,1fr)]">
            <div className="space-y-1">
              <MockButton marker={2}>New article</MockButton>
              <MockList
                marker={3}
                items={[
                  { title: "Transportation benefit", meta: "Updated Sep 1", badge: "published" },
                  { title: "Community Supports", meta: "Updated Aug 28", badge: "draft" },
                ]}
              />
            </div>
            <MockPanel title="Transportation benefit" marker={4}>
              <div className="space-y-1">
                <MockField label="Summary" value="Who qualifies for non-emergency rides." />
                <MockField label="Status" value="published" />
                <MockField label="Content" value="Members enrolled in…" />
              </div>
              <span className="mt-1.5 flex gap-1">
                <MockButton marker={5}>Save &amp; re-index</MockButton>
                <MockButton tone="danger">Delete</MockButton>
              </span>
            </MockPanel>
          </div>
        </MockScreen>
      </MockFrame>
    ),
  },

  "ai-console": {
    title: "AI console",
    alt: "AI console with a website selector, test question box, Run test button and a result panel showing confidence, escalation decision, the answer and the knowledge sources used.",
    markers: [
      "Website — answers use that site's instructions and knowledge.",
      "Test question — type exactly what a visitor would ask.",
      "Run test sends the question through the live retrieval and guardrails.",
      "Result badges: confidence score, whether the assistant would offer a live agent, and a crisis flag when triggered.",
      "Sources — the knowledge articles the answer was built from. Empty means a knowledge gap.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/ai-console">
        <MockScreen
          nav={LEAD_NAV}
          navActive="Knowledge"
          title="AI console"
          description="Ask the chatbot a question exactly as a visitor would."
        >
          <MockColumns>
            <MockPanel title="Test">
              <div className="space-y-1">
                <MockField label="Website" value="mypacifichealth.com" marker={1} />
                <MockField
                  label="Test question"
                  value="Do you help with Medi-Cal transportation in Los Angeles County?"
                  marker={2}
                />
                <MockButton marker={3}>Run test</MockButton>
              </div>
            </MockPanel>
            <MockPanel title="Result">
              <span className="flex flex-wrap gap-1">
                <MockBadge>Confidence 82%</MockBadge>
                <MockBadge tone="muted">Answered by AI</MockBadge>
                <span className="flex items-center gap-1">
                  <Marker n={4} />
                </span>
              </span>
              <p className="mt-1.5 text-[9px]">
                Non-emergency medical transportation may be available through Community Supports…
              </p>
              <p className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                <Marker n={5} /> Sources: Transportation benefit
              </p>
            </MockPanel>
          </MockColumns>
        </MockScreen>
      </MockFrame>
    ),
  },

  quality: {
    title: "Quality & QA",
    alt: "Quality screen with CSAT and QA metric cards, a conversation list, transcript panel and a scoring form with criteria, coaching notes and a supervisor flag.",
    markers: [
      "Metric cards: CSAT, positive ratings, average QA score and how many reviews are flagged for coaching.",
      "Recent conversations — reviewed items are marked so two people do not score the same chat twice.",
      "Transcript of the selected conversation.",
      "Score this conversation: Accuracy, Tone & empathy, Compliance and Resolution, each 1 to 5.",
      "Coaching notes and Flag for supervisor follow-up, then Save review.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/quality">
        <MockScreen
          nav={LEAD_NAV}
          navActive="Quality & QA"
          title="Quality &amp; QA"
          description="Visitor satisfaction, transcript review, and agent scorecards."
          actions={<MockButton tone="outline">Export CSV</MockButton>}
        >
          <MockStatRow>
            <MockStat label="CSAT" value="92%" marker={1} hint="118 ratings" />
            <MockStat label="Positive ratings" value="88%" hint="4 or 5 stars" />
            <MockStat label="Avg. QA score" value="4.3" hint="26 reviews logged" />
            <MockStat label="Flagged for coaching" value="3" tone="warn" />
          </MockStatRow>
          <div className="grid gap-2 md:grid-cols-[140px_minmax(0,1fr)]">
            <MockList
              marker={2}
              items={[
                { title: "PHG-2041", meta: "Sep 1 · Enrollment", badge: "reviewed" },
                { title: "PHG-2038", meta: "Sep 1 · Care Mgmt" },
              ]}
            />
            <div className="space-y-2">
              <MockPanel title="Transcript" marker={3}>
                <MockBubbles
                  messages={[
                    { from: "visitor", text: "I need help with my ride." },
                    { from: "agent", text: "Happy to help — let me check your plan." },
                  ]}
                />
              </MockPanel>
              <MockPanel title="Score this conversation" marker={4}>
                <MockTable
                  head={["Criterion", "Score"]}
                  rows={[
                    ["Accuracy", "4"],
                    ["Tone & empathy", "5"],
                    ["Compliance", "5"],
                    ["Resolution", "4"],
                  ]}
                />
                <p className="mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Marker n={5} /> Coaching notes · Flag for supervisor follow-up · Save review
                </p>
              </MockPanel>
            </div>
          </div>
        </MockScreen>
      </MockFrame>
    ),
  },

  reports: {
    title: "Reporting & analytics",
    alt: "Reports screen with a scope badge, filter bar, report tabs, KPI cards that drill into the ticket explorer, and an export button.",
    markers: [
      "Scope badge — the data you are allowed to see: self, team, organization or platform.",
      "Filter bar: date range preset, department, staff, website, conversation type, transfers, status, priority and SLA target.",
      "Tabs: Overview, Departments, Staff, Tickets, Transfers, Response & SLA, AI assistant, Requests. You only see the tabs your scope allows.",
      "KPI cards. Selecting one opens the Tickets tab filtered to exactly those conversations.",
      "Export CSV downloads the current view with all filters applied.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/reports">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Reports"
          title="Reporting &amp; analytics"
          description="Operational performance across conversations, departments, people and requests."
          actions={
            <span className="flex items-center gap-1">
              <Marker n={1} />
              <MockBadge>Scope: organization</MockBadge>
            </span>
          }
        >
          <MockPanel title="Filters" marker={2}>
            <div className="grid gap-1 sm:grid-cols-3">
              <MockField label="Date range" value="Last 30 days" />
              <MockField label="Department" value="All departments" />
              <MockField label="Status" value="Any status" />
            </div>
          </MockPanel>
          <MockPills
            items={["Overview", "Departments", "Staff", "Tickets", "Transfers", "Response & SLA"]}
            active="Overview"
            marker={3}
          />
          <MockStatRow>
            <MockStat label="Conversations" value="777" marker={4} hint="231 asked for a human" />
            <MockStat label="Avg. first response" value="1.6m" hint="93% within SLA" />
            <MockStat label="Waiting for a human" value="6" tone="warn" />
            <MockStat label="CSAT" value="4.6 / 5" tone="good" />
          </MockStatRow>
          <span className="flex justify-end">
            <MockButton tone="outline" marker={5}>
              Export CSV
            </MockButton>
          </span>
        </MockScreen>
      </MockFrame>
    ),
  },

  websites: {
    title: "Websites & widget settings",
    alt: "Website settings with a site list, grouped settings cards for basics, home screen, chat copy and bottom navigation, the embed snippet and a live widget preview.",
    markers: [
      "Website list, plus + Add website.",
      "Site basics: names, domains, allowed embed domains, colors, position and trigger delay.",
      "Home screen and Chat & messaging: the exact words visitors read.",
      "Bottom navigation buttons: rename, reorder, re-icon or hide tabs. Chat always stays visible.",
      "Live preview updates as you type — nothing is saved until you select Save settings.",
      "Embed snippet to paste before the closing body tag, plus Suspend and Delete controls.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/websites">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Websites"
          title="Websites &amp; widget"
          description="Branding, greetings, proactive triggers, and the embed snippet for each site."
        >
          <div className="grid gap-2 md:grid-cols-[130px_minmax(0,1fr)_120px]">
            <div className="space-y-1">
              <MockButton marker={1}>+ Add website</MockButton>
              <MockList items={[{ title: "Pacific Health", meta: "mypacifichealth.com" }]} />
            </div>
            <div className="space-y-2">
              <MockPanel title="Site basics" marker={2}>
                <div className="grid gap-1 sm:grid-cols-2">
                  <MockField label="Chatbot name" value="PHG CareConnect Assistant" />
                  <MockField label="Primary color" value="#1d4ed8" />
                </div>
              </MockPanel>
              <MockPanel title="Home screen &amp; chat copy" marker={3}>
                <MockField label="Welcome message" value="Hi there. How can we help?" />
              </MockPanel>
              <MockPanel title="Bottom navigation buttons" marker={4}>
                <MockPills items={["Home", "Chat", "Services", "Requests"]} active="Chat" />
              </MockPanel>
              <MockPanel title="Embed snippet" marker={6}>
                <p className="truncate font-mono text-[8px] text-muted-foreground">
                  &lt;script src="…/api/public/widget.js" data-website-id="…"&gt;&lt;/script&gt;
                </p>
              </MockPanel>
            </div>
            <MockPanel title="Live preview" marker={5}>
              <div className="rounded-lg border border-border p-1.5">
                <p className="gradient-brand rounded-md px-1 py-0.5 text-[8px] text-sidebar-primary-foreground">
                  PHG CareConnect Assistant
                </p>
                <p className="mt-1 text-[8px] text-muted-foreground">How can we help?</p>
              </div>
            </MockPanel>
          </div>
        </MockScreen>
      </MockFrame>
    ),
  },

  departments: {
    title: "Departments & hours",
    alt: "Departments screen with tabs for Departments, Business hours and Holidays, a department list with routing and status controls, and the add-department form.",
    markers: [
      "Tabs: Departments, Business hours, Holidays.",
      "New department — name it after the work, not the person.",
      "Each row shows routing method, member count and timezone.",
      "Controls: Make default, switch routing method, Deactivate and Delete.",
      "Business hours per weekday, and holiday closures.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/departments">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Departments"
          title="Departments &amp; hours"
          description="Routing targets, coverage windows and closures used by the widget and escalation flow."
        >
          <MockPills items={["Departments", "Business hours", "Holidays"]} active="Departments" marker={1} />
          <MockPanel title="New department" marker={2}>
            <div className="flex items-end gap-1">
              <MockField label="Name" value="e.g. Enrollment Support" />
              <MockButton>Add department</MockButton>
            </div>
          </MockPanel>
          <MockPanel title="Departments" marker={3}>
            <ul className="space-y-1">
              <li className="flex items-center justify-between gap-2 rounded-md border border-border p-1.5">
                <span className="min-w-0">
                  <span className="text-[9px] font-medium">Enrollment</span>
                  <span className="block text-[8px] text-muted-foreground">
                    round robin · 6 members · America/Los_Angeles
                  </span>
                </span>
                <span className="flex gap-1">
                  <MockBadge>Default</MockBadge>
                  <MockButton tone="outline" marker={4}>
                    Switch to first available
                  </MockButton>
                </span>
              </li>
            </ul>
          </MockPanel>
          <MockPanel title="Business hours" marker={5}>
            <MockTable
              head={["Day", "Open", "Close", "State"]}
              rows={[
                ["Monday", "09:00", "17:00", "Open"],
                ["Sunday", "—", "—", "Closed"],
              ]}
            />
          </MockPanel>
        </MockScreen>
      </MockFrame>
    ),
  },

  routing: {
    title: "Routing & templates",
    alt: "Routing screen with rule creation fields, a list of rules with enable and delete controls, and the response templates tab.",
    markers: [
      "Tabs: Routing rules and Response templates.",
      "Rule fields: name, what to match on, the value to match and the destination department.",
      "Rule list shows the match, the destination and the priority.",
      "Disable keeps a rule for later; Delete removes it immediately.",
      "Templates: name, shortcut, category and message, with Approve for the ones agents may send.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/routing">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Routing"
          title="Routing &amp; templates"
          description="Decide which department receives each escalation, and keep approved replies handy."
        >
          <MockPills items={["Routing rules", "Response templates"]} active="Routing rules" marker={1} />
          <MockPanel title="New rule" marker={2}>
            <div className="grid gap-1 sm:grid-cols-4">
              <MockField label="Rule name" value="Transport → Enrollment" />
              <MockField label="Match on" value="interest" />
              <MockField label="Value" value="transportation" />
              <MockField label="Department" value="Enrollment" />
            </div>
          </MockPanel>
          <MockPanel title="Rules" marker={3}>
            <ul className="space-y-1">
              <li className="flex items-center justify-between gap-2 rounded-md border border-border p-1.5">
                <span className="min-w-0">
                  <span className="text-[9px] font-medium">Transport → Enrollment</span>
                  <span className="block text-[8px] text-muted-foreground">
                    interest: transportation → Enrollment · priority 100
                  </span>
                </span>
                <span className="flex gap-1">
                  <MockButton tone="outline" marker={4}>
                    Disable
                  </MockButton>
                  <MockButton tone="danger">Delete</MockButton>
                </span>
              </li>
            </ul>
          </MockPanel>
          <MockPanel title="Response templates" marker={5}>
            <MockTable
              head={["Name", "Shortcut", "State"]}
              rows={[
                ["Business hours", "/hours", "Approved"],
                ["Callback promise", "/callback", "Pending approval"],
              ]}
            />
          </MockPanel>
        </MockScreen>
      </MockFrame>
    ),
  },

  staff: {
    title: "Staff & roles",
    alt: "Staff screen with search and filters, the add-staff form, invitation card and a teammate row showing role, presence, capacity, departments and account access controls.",
    markers: [
      "Search and filters: role, department and account status (Active, Disabled, Removed, All accounts).",
      "Add a staff member — creates the account immediately and shows a one-time temporary password.",
      "Invite a teammate — a single-use link that expires in 7 days.",
      "Per-teammate controls: role, presence and maximum simultaneous chats.",
      "Departments — select a name to add or remove that person; this is what drives routing.",
      "Account access: Disable, Re-enable and Remove. History is always kept.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/staff">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Staff"
          title="Staff &amp; roles"
          description="Roles control what each teammate can change. Departments drive conversation routing."
          actions={<MockField label="Search" value="Search name, email or title…" marker={1} />}
        >
          <MockColumns>
            <MockPanel title="Add a staff member" marker={2}>
              <div className="space-y-1">
                <MockField label="Work email" value="maria@mypacifichealth.com" />
                <MockField label="Role" value="Standard User" />
                <MockButton>Create account</MockButton>
              </div>
            </MockPanel>
            <MockPanel title="Invite a teammate" marker={3}>
              <p className="text-[9px] text-muted-foreground">
                Single-use link, expires in 7 days, only works for that email address.
              </p>
              <MockButton tone="outline">Invite teammate</MockButton>
            </MockPanel>
          </MockColumns>
          <MockPanel title="M. Lopez">
            <div className="grid gap-1 sm:grid-cols-3">
              <MockField label="Role" value="Team Lead" marker={4} />
              <MockField label="Presence" value="available" />
              <MockField label="Max chats" value="4" />
            </div>
            <div className="mt-1.5">
              <MockPills items={["✓ Enrollment", "+ Care Management", "+ Transportation"]} marker={5} />
            </div>
            <span className="mt-1.5 flex gap-1">
              <MockButton tone="outline" marker={6}>
                Disable
              </MockButton>
              <MockButton tone="danger">Remove</MockButton>
            </span>
          </MockPanel>
        </MockScreen>
      </MockFrame>
    ),
  },

  organizations: {
    title: "Organizations & brands",
    alt: "Organizations screen with a tenant list, tenant detail form, and cards for brands and websites.",
    markers: [
      "Tenant list — every organization you may administer.",
      "Tenant details: name, support email, phone, timezone, primary color and address.",
      "Organization-wide AI instructions, emergency message and privacy notice.",
      "Brands and Websites belonging to this tenant.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/organizations">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Dashboard"
          title="Organizations &amp; brands"
          description="Each organization is an isolated tenant with its own brands, websites, knowledge and conversations."
        >
          <div className="grid gap-2 md:grid-cols-[130px_minmax(0,1fr)]">
            <MockList
              marker={1}
              items={[
                { title: "Pacific Health Group", meta: "pacific-health" },
                { title: "CareConnect Demo", meta: "demo" },
              ]}
            />
            <div className="space-y-2">
              <MockPanel title="Tenant details" marker={2}>
                <div className="grid gap-1 sm:grid-cols-2">
                  <MockField label="Name" value="Pacific Health Group" />
                  <MockField label="Timezone" value="America/Los_Angeles" />
                </div>
                <div className="mt-1">
                  <MockField
                    label="Organization-wide AI instructions"
                    value="Never promise eligibility…"
                    marker={3}
                  />
                </div>
              </MockPanel>
              <MockColumns>
                <MockPanel title="Brands" marker={4}>
                  <p className="text-[9px]">Pacific Health /pacific-health</p>
                </MockPanel>
                <MockPanel title="Websites">
                  <p className="text-[9px]">Pacific Health · mypacifichealth.com</p>
                </MockPanel>
              </MockColumns>
            </div>
          </div>
        </MockScreen>
      </MockFrame>
    ),
  },

  settings: {
    title: "Organization settings",
    alt: "Settings screen with brand logo upload, organization contact fields, chatbot instructions, emergency message and privacy notice.",
    markers: [
      "Brand logo — PNG, JPG or SVG up to 2 MB. It replaces the organization name in the sidebar.",
      "Organization name, timezone, phone, email and address. Timezone drives every “today” number.",
      "Chatbot instructions — tone and rules layered on top of the built-in safety guardrails.",
      "Emergency / crisis message and Privacy notice shown to visitors.",
      "Save settings — nothing takes effect until you select it.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/settings">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Settings"
          title="Settings"
          description="Organization details, chatbot guardrails, and the compliance language shown to visitors."
        >
          <MockPanel title="Brand logo" marker={1}>
            <MockButton tone="outline">Upload</MockButton>
          </MockPanel>
          <MockPanel title="Organization">
            <div className="grid gap-1 sm:grid-cols-2">
              <MockField label="Organization name" value="Pacific Health Group" marker={2} />
              <MockField label="Timezone" value="America/Los_Angeles" />
            </div>
            <div className="mt-1 space-y-1">
              <MockField
                label="Chatbot instructions"
                value="Tone, escalation rules, phrases to avoid…"
                marker={3}
              />
              <MockField label="Emergency / crisis message" value="If this is an emergency, call 911." marker={4} />
            </div>
            <span className="mt-1.5 flex justify-end">
              <MockButton marker={5}>Save settings</MockButton>
            </span>
          </MockPanel>
        </MockScreen>
      </MockFrame>
    ),
  },

  security: {
    title: "Security",
    alt: "Security screen with the organization MFA policy card, personal authenticator enrollment and account hygiene guidance.",
    markers: [
      "Organization MFA policy: require two-step verification for everyone, for administrators only, or leave it optional.",
      "Your own authenticator app: Add authenticator app, scan the QR code, then confirm the 6-digit code.",
      "Account hygiene reminders.",
      "Sign out other devices ends every other session on your account.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/security">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Security"
          title="Security"
          description="Protect your staff account with an authenticator app."
        >
          <MockPanel title="Organization MFA policy" marker={1}>
            <MockTable
              head={["Rule", "State"]}
              rows={[
                ["Require for all staff", "off"],
                ["Require for administrators", "on"],
              ]}
            />
          </MockPanel>
          <MockColumns>
            <MockPanel title="Two-factor authentication" marker={2}>
              <span className="flex gap-1">
                <MockBadge tone="good">Enabled</MockBadge>
                <MockButton tone="outline">Add authenticator app</MockButton>
              </span>
            </MockPanel>
            <MockPanel title="Account hygiene" marker={3}>
              <p className="text-[9px] text-muted-foreground">
                · Every sign-in, role change and record edit is written to the audit log.
              </p>
              <span className="mt-1 inline-flex">
                <MockButton tone="outline" marker={4}>
                  Sign out other devices
                </MockButton>
              </span>
            </MockPanel>
          </MockColumns>
        </MockScreen>
      </MockFrame>
    ),
  },

  audit: {
    title: "Audit log",
    alt: "Audit log with search, CSV export and a table of timestamped actions with actor, action and affected record.",
    markers: [
      "Search across action, record and person.",
      "Export CSV of the entries matching your search.",
      "Columns: When, Actor, Action, Record. Entries can never be edited or deleted.",
    ],
    render: () => (
      <MockFrame label="chat.mypacifichealth.com/audit">
        <MockScreen
          nav={ADMIN_NAV}
          navActive="Audit log"
          title="Audit log"
          description="Append-only history of configuration and record changes."
          actions={
            <span className="flex items-center gap-1">
              <MockField label="Search" value="Search action, record, or person" marker={1} />
              <MockButton tone="outline" marker={2}>
                Export CSV
              </MockButton>
            </span>
          }
        >
          <MockTable
            marker={3}
            head={["When", "Actor", "Action", "Record"]}
            rows={[
              ["Sep 1, 4:12 PM", "M. Lopez", "conversation.assigned", "conversation · 8f21a3c4"],
              ["Sep 1, 3:58 PM", "A. Patel", "staff_profile.updated", "profile · 42d0bb17"],
              ["Sep 1, 3:40 PM", "System", "website_settings.updated", "website · 71c9de02"],
            ]}
          />
        </MockScreen>
      </MockFrame>
    ),
  },

  "widget-visitor": {
    title: "What the visitor sees",
    alt: "Chat widget on a public website showing the assistant header, a Talk to an agent button, the conversation and the bottom navigation tabs.",
    markers: [
      "Header: the assistant name configured for that website.",
      "Talk to an agent — this is what puts a conversation in your Waiting queue.",
      "AI answers appear immediately, drawn from published knowledge articles.",
      "Visitors can attach a file; it appears in your transcript with View and Save.",
      "Bottom tabs: Home, Chat, Services and Requests, exactly as configured in Websites.",
      "After a chat ends the visitor is asked to rate it — that rating becomes CSAT.",
    ],
    render: () => (
      <MockFrame label="mypacifichealth.com">
        <div className="flex justify-end p-3">
          <div className="w-[210px] overflow-hidden rounded-xl border border-border bg-card shadow-float">
            <div className="gradient-brand flex items-center justify-between px-2 py-1.5 text-sidebar-primary-foreground">
              <span className="flex items-center gap-1 text-[9px] font-semibold">
                <Marker n={1} /> PHG CareConnect Assistant
              </span>
              <span className="flex items-center gap-1 rounded-full bg-background/20 px-1.5 py-0.5 text-[8px]">
                <Marker n={2} /> Talk to an agent
              </span>
            </div>
            <div className="space-y-1.5 p-2">
              <MockBubbles
                marker={3}
                messages={[
                  { from: "ai", text: "Hi there. How can we help today?" },
                  { from: "visitor", text: "I need a ride to my appointment." },
                ]}
              />
              <div className="rounded-md border border-border p-1 text-[8px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Marker n={4} /> insurance-card.jpg · 240 KB
                </span>
              </div>
              <div className="rounded-md border border-border p-1 text-[8px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Marker n={6} /> How did we do? ★★★★★
                </span>
              </div>
            </div>
            <div className="flex items-center justify-around border-t border-border px-1 py-1 text-[8px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <Marker n={5} /> Home
              </span>
              <span className="font-semibold text-primary">Chat</span>
              <span>Services</span>
              <span>Requests</span>
            </div>
          </div>
        </div>
      </MockFrame>
    ),
  },
};
