/**
 * Configuration chapters: the screens that change how CareConnect behaves for
 * everyone else. Every chapter is gated on the permission that actually guards
 * the screen, so these never appear in a guide whose role cannot open them.
 */
import type { Chapter } from "../types";

export const websitesChapter: Chapter = {
  id: "websites",
  title: "Websites & the chat widget",
  intro: "Branding, copy, tabs and the code that puts the widget on a public site.",
  gate: { anyOf: ["website.manage"] },
  sections: [
    {
      id: "websites-list",
      title: "Websites in your organization",
      summary: "Understand what a website record controls.",
      blocks: [
        { kind: "figure", figure: "websites" },
        {
          kind: "p",
          text: "Each website record represents one public site running the widget. It owns that site's branding, welcome copy, tabs, assistant instructions and embed snippet — so two brands can behave completely differently.",
        },
        {
          kind: "steps",
          items: [
            "Open Websites from the sidebar.",
            "Select a website to edit it, or create a new one for a new brand or domain.",
            "Work through the setting groups: Basics, Home, Chat and Navigation.",
            "Watch the live preview beside the settings — it renders exactly what a visitor will see.",
          ],
        },
      ],
    },
    {
      id: "websites-settings",
      title: "The setting groups",
      summary: "Change the right setting the first time.",
      blocks: [
        {
          kind: "table",
          head: ["Group", "Controls"],
          rows: [
            ["Basics", "Website name, domain, brand colors, logo and the assistant's display name"],
            ["Home", "The greeting shown when the widget opens, plus quick-start buttons"],
            ["Chat", "Chat header text, the “Talk to an agent” option, attachments and the satisfaction prompt"],
            ["Navigation", "Which tabs the widget shows and what each one contains"],
          ],
        },
        {
          kind: "steps",
          title: "Choosing colors",
          items: [
            "Use the color picker to set the brand color, or type an exact hex value.",
            "Check the preview in both light and dark surroundings.",
            "Keep text and background contrast high enough to read on a phone in daylight.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Changes are public immediately",
          text: "Saving updates the live widget on that website. Preview first, then save, then load the public page to confirm.",
        },
      ],
    },
    {
      id: "websites-embed",
      title: "Installing the widget",
      summary: "Hand a working snippet to whoever runs the website.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Open the website record and copy the embed snippet.",
            "Send it to the person who maintains the site, asking them to paste it before the closing </body> tag on every page.",
            "Load the public site and confirm the launcher appears.",
            "Send a test message and confirm it arrives in the Inbox.",
          ],
        },
        {
          kind: "checklist",
          title: "Go-live checklist for a new website",
          items: [
            "Branding, logo and assistant name match the brand",
            "Welcome message and quick-start buttons reviewed",
            "Published knowledge articles cover that brand's common questions",
            "A routing rule sends escalations to a real department",
            "That department has business hours and members",
            "A test conversation was escalated, claimed, answered and resolved",
          ],
        },
      ],
    },
  ],
};

export const departmentsChapter: Chapter = {
  id: "departments",
  title: "Departments & hours",
  intro: "The teams that receive work, and when they are open.",
  gate: { anyOf: ["department.manage"] },
  sections: [
    {
      id: "departments-manage",
      title: "Creating and editing departments",
      summary: "Set up a team that can actually receive conversations.",
      blocks: [
        { kind: "figure", figure: "departments" },
        {
          kind: "steps",
          items: [
            "Open Departments from the sidebar.",
            "Create a department with a name staff will recognise on a transfer menu.",
            "Set its business hours per weekday, in the organization's timezone.",
            "Add holiday closures for dates the team is unavailable.",
            "Add members — a department with no members cannot be routed to sensibly.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Hours change visitor expectations",
          text: "Outside business hours the widget sets a different expectation for a reply. Keep hours truthful rather than optimistic.",
        },
      ],
    },
    {
      id: "departments-health",
      title: "Keeping departments healthy",
      summary: "Prevent the queue nobody watches.",
      blocks: [
        {
          kind: "checklist",
          title: "Monthly review",
          items: [
            "Every department still has an owner and enough members",
            "Members' capacity settings reflect real workload",
            "Holiday closures for the next quarter are entered",
            "No department is receiving work it never resolves",
            "Departments that no longer exist have been retired and their routing rules updated",
          ],
        },
      ],
    },
  ],
};

export const routingChapter: Chapter = {
  id: "routing",
  title: "Routing & templates",
  intro: "Where escalations go, and the approved wording staff reuse.",
  gate: { anyOf: ["routing.manage"] },
  sections: [
    {
      id: "routing-rules",
      title: "Routing rules",
      summary: "Send each escalation to the team that can resolve it.",
      blocks: [
        { kind: "figure", figure: "routing" },
        {
          kind: "steps",
          items: [
            "Open Routing from the sidebar.",
            "Create a rule that matches on the website and the conversation's topic or intent.",
            "Choose the destination department.",
            "Set the order — rules are evaluated in order, and the first match wins.",
            "Save, then send a test message through the widget to confirm it lands in the right queue.",
          ],
        },
        {
          kind: "bullets",
          title: "How assignment then works",
          items: [
            "Members of the destination department are notified that work is waiting.",
            "Round-robin assignment offers work fairly to available staff who are under capacity.",
            "Anyone eligible can claim from the queue; the first successful claim wins.",
            "If nobody is available, the conversation waits in the queue and appears as SLA risk on dashboards.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Always keep a catch-all",
          text: "Make sure a final, broad rule sends anything unmatched to a staffed department. Without it a conversation can sit unclaimed.",
        },
      ],
    },
    {
      id: "routing-templates",
      title: "Response templates",
      summary: "Give staff approved wording for repeated situations.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Open the templates area of the Routing screen.",
            "Create a template with a name staff will search for, and body text they can send with minimal edits.",
            "Keep the wording compliant — no eligibility promises, no clinical advice.",
            "Review templates whenever a program or policy changes.",
          ],
        },
      ],
    },
  ],
};

export const staffChapter: Chapter = {
  id: "staff",
  title: "Staff administration",
  intro: "Accounts, roles, departments and capacity.",
  gate: { anyOf: ["staff.view"] },
  sections: [
    {
      id: "staff-directory",
      title: "The staff directory",
      summary: "Read the roster at a glance.",
      blocks: [
        { kind: "figure", figure: "staff" },
        {
          kind: "p",
          text: "The directory lists everyone in the organization with their role, departments, presence, capacity and status. Search by name or email, filter by role or status, and page through with Prev and Next.",
        },
      ],
    },
    {
      id: "staff-add",
      title: "Adding a teammate",
      summary: "Create access safely.",
      gate: { anyOf: ["staff.create"] },
      blocks: [
        {
          kind: "steps",
          title: "Create the account directly",
          items: [
            "Select Add staff.",
            "Enter their work email and full name.",
            "Choose the role — grant the lowest role that lets them do the job.",
            "Assign departments and set maximum simultaneous chats.",
            "Create the account. A temporary password is shown once — copy it and deliver it through a channel your organization approves.",
            "Tell them to change it immediately after signing in.",
          ],
        },
        {
          kind: "steps",
          title: "Or send an invitation",
          items: [
            "Select the invitation option and enter the email and role.",
            "Send the link. It is single-use, tied to that email, and expires after 7 days.",
            "If it expires, issue a new one — old links stop working.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Never share a temporary password insecurely",
          text: "Do not send it by SMS, personal email or a public channel. If in doubt, use an invitation link instead.",
        },
      ],
    },
    {
      id: "staff-edit",
      title: "Roles, departments and capacity",
      summary: "Change access as people change jobs.",
      gate: { anyOf: ["staff.edit", "role.manage"] },
      blocks: [
        {
          kind: "steps",
          items: [
            "Open the person's record from the directory.",
            "Change their role, departments or maximum simultaneous chats.",
            "Save. The change takes effect on their next page load and is written to the audit log.",
          ],
        },
        {
          kind: "bullets",
          title: "Rules the system enforces",
          items: [
            "Roles are cumulative — each level includes everything below it.",
            "You cannot grant a role above your own.",
            "Only the highest level of administration may create or change other administrators.",
            "You cannot remove the last administrator of an organization.",
            "Nobody can raise their own role, even by editing their own profile.",
          ],
        },
      ],
    },
    {
      id: "staff-offboard",
      title: "Disabling and removing access",
      summary: "Close access the moment someone leaves.",
      gate: { anyOf: ["staff.disable", "staff.remove"] },
      blocks: [
        {
          kind: "steps",
          items: [
            "Reassign their open conversations and intake requests first — disabling does not hand work over.",
            "Open their record and disable the account. They can no longer sign in; their history is retained.",
            "Remove the membership only when the separation is permanent and your retention policy allows it.",
          ],
        },
        {
          kind: "checklist",
          title: "Offboarding checklist",
          items: [
            "Open conversations reassigned",
            "Open intake requests reassigned",
            "Account disabled the same day access ends",
            "Departments and routing updated if they were the only member",
            "Change confirmed in the audit log",
          ],
        },
      ],
    },
  ],
};

export const orgSettingsChapter: Chapter = {
  id: "org-settings",
  title: "Organization settings",
  intro: "Contact details, timezone, assistant guardrails and compliance notices.",
  gate: { anyOf: ["settings.manage"] },
  sections: [
    {
      id: "org-settings-basics",
      title: "Organization profile and timezone",
      summary: "Set the values everything else depends on.",
      blocks: [
        { kind: "figure", figure: "settings" },
        {
          kind: "bullets",
          items: [
            "Organization name and public contact details used in visitor-facing copy.",
            "Timezone — every report, “today” and business-hours calculation uses it.",
            "Default first-response target, which drives SLA figures across the platform.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Changing the timezone moves the numbers",
          text: "Reports recalculate against the new timezone, so historical daily totals can shift. Change it once, deliberately, and tell the team.",
        },
      ],
    },
    {
      id: "org-settings-guardrails",
      title: "Assistant guardrails and compliance notices",
      summary: "Control what the assistant is allowed to say.",
      blocks: [
        {
          kind: "bullets",
          items: [
            "Assistant instructions — the tone and boundaries applied to every answer.",
            "Emergency message — shown immediately when crisis language is detected.",
            "Compliance notices — the disclaimers displayed to visitors.",
          ],
        },
        {
          kind: "doDont",
          dos: [
            "State clearly that the assistant cannot give clinical advice or confirm eligibility.",
            "Keep the emergency message short, direct and actionable.",
            "Review the wording with whoever owns compliance before saving.",
          ],
          donts: [
            "Do not weaken guardrails to make the assistant more helpful.",
            "Do not put program specifics here — those belong in knowledge articles.",
          ],
        },
      ],
    },
  ],
};

export const securityChapter: Chapter = {
  id: "security",
  title: "Security",
  intro: "Authentication policy and your own authenticator.",
  gate: { anyOf: ["security.manage"] },
  sections: [
    {
      id: "security-policy",
      title: "Two-step verification policy",
      summary: "Decide who must use an authenticator.",
      blocks: [
        { kind: "figure", figure: "security" },
        {
          kind: "steps",
          items: [
            "Open Security from the sidebar.",
            "Choose the policy: optional, required for administrators, or required for everyone.",
            "Save. Affected staff are asked to enrol the next time they sign in.",
            "Manage your own enrolled authenticator from the same screen.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Announce before you enforce",
          text: "Requiring verification for everyone blocks sign-in until each person enrols. Tell the team a day ahead and make sure someone can help with lockouts.",
        },
      ],
    },
  ],
};

export const auditChapter: Chapter = {
  id: "audit",
  title: "Audit log",
  intro: "The append-only record of who changed what.",
  gate: { anyOf: ["audit.view"] },
  sections: [
    {
      id: "audit-read",
      title: "Reading the log",
      summary: "Answer “who did this, and when?”.",
      blocks: [
        { kind: "figure", figure: "audit" },
        {
          kind: "steps",
          items: [
            "Open Audit log from the sidebar.",
            "Filter by action, actor or date range.",
            "Read the entry: who acted, what changed, and the values before and after.",
            "Page through results with Prev and Next.",
          ],
        },
        {
          kind: "bullets",
          title: "What is recorded",
          items: [
            "Sign-ins and security changes",
            "Staff creation, role changes, disabling and removal",
            "Conversation claims, transfers, reassignments and closures",
            "Contact and intake record changes",
            "Website, department, routing and organization setting changes",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Nothing here can be edited",
          text: "The log is append-only for everyone, including administrators. That is what makes it usable as evidence.",
        },
      ],
    },
  ],
};

export const platformChapter: Chapter = {
  id: "platform",
  title: "Organizations & brands",
  intro: "Managing multiple tenants on one platform.",
  gate: { anyOf: ["organization.manage", "platform.manage", "platform.tenant_admin"] },
  sections: [
    {
      id: "platform-tenants",
      title: "Organizations, brands and websites",
      summary: "Keep tenants genuinely separate.",
      blocks: [
        { kind: "figure", figure: "organizations" },
        {
          kind: "p",
          text: "An organization is a tenant. Under it sit brands and websites. Conversations, knowledge, contacts, staff and settings never cross a tenant boundary — the database enforces this, not just the interface.",
        },
        {
          kind: "steps",
          title: "Onboarding a new organization",
          items: [
            "Create the organization and set its timezone and contact details.",
            "Create its first website and apply the brand's colors, logo and assistant name.",
            "Create the departments that will receive work, with hours and members.",
            "Add routing rules, including a catch-all.",
            "Load and publish the starting knowledge articles and widget FAQs.",
            "Create the first administrator for that organization and hand over.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Cross-tenant access is exceptional",
          text: "Platform access exists for support, not for browsing. Enter a tenant only for a specific, justified task — every action is attributed to you in that tenant's audit log.",
        },
      ],
    },
    {
      id: "platform-health",
      title: "Platform health checks",
      summary: "Keep every tenant configured correctly.",
      blocks: [
        {
          kind: "checklist",
          title: "Per-tenant review",
          items: [
            "At least two administrators, so nobody is locked out",
            "Timezone and first-response target set",
            "Every website has a catch-all routing rule to a staffed department",
            "Departments have current hours, holidays and members",
            "Knowledge is published and free of contradictions",
            "Two-step verification policy matches the tenant's requirements",
          ],
        },
      ],
    },
  ],
};
