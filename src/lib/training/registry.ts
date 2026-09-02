/**
 * Composition of the five role guides plus the platform guide.
 *
 * Each guide is assembled from shared chapters (so a Team Lead never reads a
 * different version of "how to claim a conversation" than a Standard User) and
 * a role-specific welcome, day-one checklist and knowledge check.
 */
import type { Chapter, Guide, GuideRole, QuizItem } from "./types";
import {
  accessChapter,
  consoleChapter,
  glossaryChapter,
  privacyChapter,
  troubleshootingChapter,
} from "./content/common";
import {
  contactsChapter,
  dashboardChapter,
  inboxChapter,
  intakeChapter,
  notificationsChapter,
  profileChapter,
} from "./content/workspace";
import {
  aiConsoleChapter,
  knowledgeChapter,
  qualityChapter,
  reportsChapter,
  visitorChapter,
} from "./content/content-ai";
import {
  auditChapter,
  departmentsChapter,
  orgSettingsChapter,
  platformChapter,
  routingChapter,
  securityChapter,
  staffChapter,
  websitesChapter,
} from "./content/configuration";

type WelcomeInput = {
  role: GuideRole;
  lead: string;
  responsibilities: string[];
  boundaries: string[];
  firstDay: string[];
  firstWeek: string[];
};

function welcomeChapter(input: WelcomeInput): Chapter {
  return {
    id: "welcome",
    title: "Start here",
    intro: "What your role is responsible for, and what to do on day one.",
    sections: [
      {
        id: "welcome-role",
        title: "Your role in CareConnect",
        summary: "Know exactly what you own — and what you do not.",
        blocks: [
          { kind: "lead", text: input.lead },
          { kind: "bullets", title: "You are responsible for", items: input.responsibilities },
          { kind: "bullets", title: "You are not responsible for", items: input.boundaries },
          {
            kind: "callout",
            tone: "tip",
            title: "How to use this guide",
            text: "Read Start here and Getting into CareConnect before your first shift. Keep the rest open beside you and work through a chapter whenever you meet that screen for real.",
          },
        ],
      },
      {
        id: "welcome-day-one",
        title: "Day one and week one",
        summary: "Finish onboarding without needing to be chased.",
        blocks: [
          { kind: "checklist", title: "Before your first shift", items: input.firstDay },
          { kind: "checklist", title: "By the end of your first week", items: input.firstWeek },
        ],
      },
    ],
  };
}

function knowledgeCheck(id: string, items: QuizItem[]): Chapter {
  return {
    id: "knowledge-check",
    title: "Knowledge check",
    intro: "Five questions. Answer them from memory before you take your first live conversation.",
    sections: [
      {
        id: `${id}-quiz`,
        title: "Check yourself",
        summary: "Confirm you can act correctly without looking anything up.",
        blocks: [{ kind: "quiz", items }],
      },
    ],
  };
}

const AGENT_GUIDE: Guide = {
  role: "agent",
  label: "Standard User",
  tagline: "Answer visitors, capture referrals, keep records clean.",
  audience: "Front-line staff who handle website chats and intake requests.",
  duration: "About 35 minutes",
  chapters: [
    welcomeChapter({
      role: "agent",
      lead: "You are the person a visitor reaches when the assistant cannot finish the job. Your work is to answer clearly, capture what is needed, and finish every conversation properly.",
      responsibilities: [
        "Claiming waiting conversations and replying promptly",
        "Keeping your availability accurate so routing works",
        "Recording contact details and notes as you learn them",
        "Moving intake requests through their stages",
        "Resolving or closing conversations rather than leaving them open",
      ],
      boundaries: [
        "Changing anyone's role, department or capacity",
        "Editing knowledge articles or widget settings",
        "Viewing other people's individual performance",
        "Giving clinical advice or promising eligibility, coverage or approval",
      ],
      firstDay: [
        "Sign in and change your temporary password",
        "Set up two-step verification if your organization requires it",
        "Complete My settings: name, display name, languages and timezone",
        "Set your availability to Available",
        "Read the Inbox and Privacy chapters",
      ],
      firstWeek: [
        "Claim, answer and resolve a conversation end to end",
        "Handle an intake request from new through to a later stage",
        "Update a contact record and write a useful staff note",
        "Enable desktop alerts and set your notification preferences",
        "Know who your team lead is and how to escalate",
      ],
    }),
    accessChapter,
    consoleChapter,
    dashboardChapter("self"),
    inboxChapter,
    intakeChapter,
    contactsChapter,
    visitorChapter,
    knowledgeChapter,
    notificationsChapter,
    profileChapter,
    privacyChapter,
    troubleshootingChapter,
    glossaryChapter,
    knowledgeCheck("agent", [
      {
        question: "A conversation is in the Waiting tab and you want to reply. What must you do first?",
        options: ["Just type in the reply box", "Select Claim conversation", "Transfer it to your department", "Mark it resolved"],
        answer: 1,
        why: "Unassigned conversations have no reply box. Claiming makes you the owner, and only the owner may reply.",
      },
      {
        question: "Your claim fails with “Could not claim this conversation”. What happened?",
        options: [
          "The visitor left",
          "You are signed out",
          "Someone claimed it first, or you are at your capacity limit",
          "The conversation was deleted",
        ],
        answer: 2,
        why: "Claims are first-come, first-served and capacity-aware. Move on to the next waiting item.",
      },
      {
        question: "A visitor says they are in immediate danger. What do you do?",
        options: [
          "Transfer the chat and move on",
          "Stay with them, repeat the emergency guidance including calling 911, and escalate to a supervisor",
          "Close the conversation",
          "Give first-aid instructions",
        ],
        answer: 1,
        why: "CareConnect is not a clinical tool. Stay present, repeat the emergency guidance and escalate immediately.",
      },
      {
        question: "The chat is over but the visitor's need was not met. Which action is correct?",
        options: ["Resolve", "Close", "Leave it open", "Mark it spam"],
        answer: 1,
        why: "Resolve means the need was met; Close means finished without a resolution. Reporting depends on the difference.",
      },
      {
        question: "Where may you record notes about a member?",
        options: [
          "A personal spreadsheet",
          "Staff notes on the contact record in CareConnect",
          "A team messaging app",
          "Your own email",
        ],
        answer: 1,
        why: "Member information stays inside CareConnect, where access is controlled and every change is logged.",
      },
    ]),
  ],
};

const TEAM_LEAD_GUIDE: Guide = {
  role: "team_lead",
  label: "Team Lead",
  tagline: "Keep the queue moving and the team balanced.",
  audience: "Supervisors responsible for a department's day-to-day service.",
  duration: "About 45 minutes",
  chapters: [
    welcomeChapter({
      role: "team_lead",
      lead: "You do everything a Standard User does, plus you decide who works what. Transfers, reassignments and queue health are yours.",
      responsibilities: [
        "Watching department queues and clearing what is waiting",
        "Transferring conversations to the right department and reassigning to the right person",
        "Balancing workload against each teammate's capacity and presence",
        "Reviewing quality and coaching individuals privately",
        "Reporting on your departments",
      ],
      boundaries: [
        "Creating accounts or changing roles — you can view staff, not edit them",
        "Editing knowledge articles or widget configuration",
        "Changing routing rules, departments or organization settings",
      ],
      firstDay: [
        "Complete everything on the Standard User day-one list",
        "Confirm which departments you supervise",
        "Open the Department tab in the Inbox and learn its rhythm",
        "Run the 60-second team check on your dashboard",
      ],
      firstWeek: [
        "Transfer a conversation to another department and explain it to the visitor first",
        "Reassign a conversation using the eligibility list",
        "Review one high and one low satisfaction transcript",
        "Run a Reports view for your departments and export it",
        "Agree escalation paths with your manager",
      ],
    }),
    accessChapter,
    consoleChapter,
    dashboardChapter("team"),
    inboxChapter,
    intakeChapter,
    contactsChapter,
    visitorChapter,
    knowledgeChapter,
    qualityChapter,
    reportsChapter,
    staffChapter,
    notificationsChapter,
    profileChapter,
    privacyChapter,
    troubleshootingChapter,
    glossaryChapter,
    knowledgeCheck("team-lead", [
      {
        question: "A conversation belongs to the wrong team. What is the correct action?",
        options: ["Close it", "Transfer it to the right department", "Reply anyway", "Delete it"],
        answer: 1,
        why: "Transfer moves it to another department's queue and notifies that department. Reassign moves it to a person within the department.",
      },
      {
        question: "In the Reassign dialog a teammate is listed but greyed out. Why?",
        options: [
          "They are on holiday",
          "They are ineligible — offline, at capacity, or not in this department — and the reason is shown",
          "They have no photo",
          "The list is broken",
        ],
        answer: 1,
        why: "Only active, in-department staff with spare capacity are eligible. Overrides require a written reason, which is recorded.",
      },
      {
        question: "An unassigned conversation needs a reply and you are a supervisor. Can you type straight into it?",
        options: [
          "Yes, supervisors bypass ownership",
          "No — it must be claimed or assigned to someone first",
          "Only in the Closed tab",
          "Only after exporting it",
        ],
        answer: 1,
        why: "Ownership is enforced for everyone. Claim it yourself or assign it, then reply.",
      },
      {
        question: "Your department's Oldest waiting figure is climbing and nobody is Available. What first?",
        options: [
          "Wait for the next shift",
          "Rebalance: reassign to someone with capacity, or claim the oldest conversation yourself",
          "Close the waiting conversations",
          "Change the SLA target",
        ],
        answer: 1,
        why: "Waiting time is the visitor's experience. Move work to available capacity or take it yourself.",
      },
      {
        question: "You need to coach someone about a low rating. Where do you discuss it?",
        options: [
          "In the team channel",
          "Privately with the individual, using the transcript as evidence",
          "In the conversation with the visitor",
          "In a knowledge article",
        ],
        answer: 1,
        why: "Individual performance is coached privately. Review transcripts inside the platform, never by copying them out.",
      },
    ]),
  ],
};

const MANAGER_GUIDE: Guide = {
  role: "manager",
  label: "Manager",
  tagline: "Own the answers the assistant gives and the outcomes the team produces.",
  audience: "Managers accountable for service quality and knowledge accuracy.",
  duration: "About 55 minutes",
  chapters: [
    welcomeChapter({
      role: "manager",
      lead: "You own what the assistant says and how well the work is done. Knowledge, workflow and quality sit with you; platform configuration does not.",
      responsibilities: [
        "Writing, publishing and retiring knowledge articles and widget FAQs",
        "Testing the assistant in the AI console before visitors see an answer",
        "Managing intake workflow end to end",
        "Editing contact records and keeping the directory accurate",
        "Quality review, coaching and departmental reporting",
      ],
      boundaries: [
        "Creating staff accounts or changing roles",
        "Websites, departments, routing and organization settings",
        "Security policy and the audit log",
      ],
      firstDay: [
        "Complete the Team Lead day-one list",
        "Read the published knowledge base end to end",
        "Run five real visitor questions through the AI console",
        "Check the Quality summary for the last 30 days",
      ],
      firstWeek: [
        "Publish or correct at least one knowledge article",
        "Review widget FAQs and reorder them by real demand",
        "Complete a quality review cycle for your team",
        "Agree a knowledge review schedule with your administrator",
        "Export a report and share the findings with your team",
      ],
    }),
    accessChapter,
    consoleChapter,
    dashboardChapter("team"),
    inboxChapter,
    intakeChapter,
    contactsChapter,
    visitorChapter,
    knowledgeChapter,
    aiConsoleChapter,
    qualityChapter,
    reportsChapter,
    staffChapter,
    notificationsChapter,
    profileChapter,
    privacyChapter,
    troubleshootingChapter,
    glossaryChapter,
    knowledgeCheck("manager", [
      {
        question: "The assistant gave a confident but wrong answer. What is the fix?",
        options: [
          "Tell staff to correct visitors afterwards",
          "Reproduce it in the AI console, then correct or unpublish the article behind it",
          "Turn the assistant off",
          "Add the correction to a response template only",
        ],
        answer: 1,
        why: "The assistant answers from published articles. Fix the source and the answer changes for everyone.",
      },
      {
        question: "Which content belongs in a knowledge article?",
        options: [
          "A one-off policy exception",
          "Approved, general guidance you would be happy to see quoted verbatim",
          "Staff direct phone numbers",
          "Internal ticket references",
        ],
        answer: 1,
        why: "Published articles are quoted to visitors. Exceptions and internal details never belong there.",
      },
      {
        question: "What happens the moment you publish an article?",
        options: [
          "Nothing until a nightly rebuild",
          "It becomes available to the assistant immediately",
          "An administrator must approve it",
          "It only appears in Reports",
        ],
        answer: 1,
        why: "Publishing is live. Draft while you work and publish only when the content is correct.",
      },
      {
        question: "Testing a question in the AI console does what?",
        options: [
          "Creates a real conversation",
          "Notifies the department",
          "Nothing visitor-facing — it is a safe test",
          "Publishes a new article",
        ],
        answer: 2,
        why: "The console is for testing. It never reaches a visitor and creates no conversation.",
      },
      {
        question: "A report figure differs from a colleague's for the same day. Most likely cause?",
        options: [
          "A bug",
          "Different reach — their role scopes the data differently — or a different timezone assumption",
          "The export was capped",
          "The assistant changed the data",
        ],
        answer: 1,
        why: "Reports are scoped to what each role may see, and all dates use the organization's timezone.",
      },
    ]),
  ],
};

const ADMINISTRATOR_GUIDE: Guide = {
  role: "administrator",
  label: "Administrator",
  tagline: "Configure the platform, run staff access, keep the audit trail clean.",
  audience: "Administrators responsible for an organization's CareConnect setup.",
  duration: "About 70 minutes",
  chapters: [
    welcomeChapter({
      role: "administrator",
      lead: "You decide how CareConnect behaves for everyone else in your organization: who has access, where work is routed, what the widget looks like and what the assistant is allowed to say.",
      responsibilities: [
        "Creating, editing, disabling and removing staff accounts",
        "Assigning roles, departments and capacity",
        "Websites, widget branding and the embed snippet",
        "Departments, business hours, holidays and routing rules",
        "Organization settings, guardrails and compliance notices",
        "Reviewing the audit log",
      ],
      boundaries: [
        "Creating or changing other administrators — that requires the highest level",
        "Two-step verification policy and cross-organization management",
        "Editing history: the audit log is append-only for you too",
      ],
      firstDay: [
        "Complete the Manager day-one list",
        "Confirm the organization timezone and first-response target",
        "Review every website's branding and welcome copy",
        "Check that each website has a catch-all routing rule",
        "Confirm every department has hours and members",
      ],
      firstWeek: [
        "Create one staff account and one invitation, and watch both sign in",
        "Add next quarter's holiday closures",
        "Review the audit log for unexpected changes",
        "Run a full go-live checklist against a live website",
        "Document who covers administration when you are away",
      ],
    }),
    accessChapter,
    consoleChapter,
    dashboardChapter("organization"),
    inboxChapter,
    intakeChapter,
    contactsChapter,
    visitorChapter,
    knowledgeChapter,
    aiConsoleChapter,
    qualityChapter,
    reportsChapter,
    websitesChapter,
    departmentsChapter,
    routingChapter,
    staffChapter,
    orgSettingsChapter,
    auditChapter,
    notificationsChapter,
    profileChapter,
    privacyChapter,
    troubleshootingChapter,
    glossaryChapter,
    knowledgeCheck("administrator", [
      {
        question: "You create a staff account directly. What happens to the temporary password?",
        options: [
          "It is emailed automatically",
          "It is shown once and cannot be retrieved later",
          "It never expires",
          "It is stored in the audit log",
        ],
        answer: 1,
        why: "Copy it at creation and deliver it through an approved channel — or send an invitation link instead.",
      },
      {
        question: "Someone leaves the organization today. What is the correct order?",
        options: [
          "Disable the account, then reassign their work",
          "Reassign their open conversations and intakes, then disable the account the same day",
          "Delete the account immediately",
          "Wait until their work closes naturally",
        ],
        answer: 1,
        why: "Disabling does not hand work over. Move the work first, then close access without delay.",
      },
      {
        question: "Why must every website have a catch-all routing rule?",
        options: [
          "To improve AI accuracy",
          "So an unmatched escalation still lands in a staffed department instead of waiting unclaimed",
          "To enable exports",
          "To satisfy the widget preview",
        ],
        answer: 1,
        why: "Rules are evaluated in order and the first match wins. Without a final broad rule, some conversations have nowhere to go.",
      },
      {
        question: "You change the organization timezone. What else changes?",
        options: [
          "Nothing",
          "Reports, “today” calculations and business hours all recalculate against the new timezone",
          "Only the widget",
          "Staff passwords reset",
        ],
        answer: 1,
        why: "The timezone is the basis for every date calculation. Change it deliberately and tell the team.",
      },
      {
        question: "You spot an audit entry you cannot explain. What can you do?",
        options: [
          "Edit it to add context",
          "Delete it",
          "Investigate and add your findings elsewhere — the log itself cannot be changed",
          "Ask support to rewrite it",
        ],
        answer: 2,
        why: "The audit log is append-only for everyone, which is exactly what makes it trustworthy.",
      },
    ]),
  ],
};

const SUPER_ADMIN_GUIDE: Guide = {
  role: "super_admin",
  label: "Super Admin",
  tagline: "Highest authority in the organization: administrators, security and tenants.",
  audience: "The small group accountable for CareConnect as a whole.",
  duration: "About 80 minutes",
  chapters: [
    welcomeChapter({
      role: "super_admin",
      lead: "You hold everything an Administrator holds, plus the three powers nobody else has: managing other administrators, setting authentication policy, and managing organizations and brands.",
      responsibilities: [
        "Appointing and removing administrators",
        "Setting the two-step verification policy",
        "Creating and configuring organizations, brands and their websites",
        "Being the final escalation point for access and security questions",
        "Making sure no organization is left without a working administrator",
      ],
      boundaries: [
        "Editing the audit log — impossible by design",
        "Reading data outside a task you can justify",
        "Bypassing conversation ownership rules",
      ],
      firstDay: [
        "Complete the Administrator day-one list",
        "Confirm at least two administrators exist in every organization",
        "Review the two-step verification policy",
        "Check every tenant's timezone, routing catch-all and department staffing",
      ],
      firstWeek: [
        "Run a full per-tenant health check",
        "Test the lockout recovery path with a colleague",
        "Review the audit log for role and security changes",
        "Document the on-call path for access emergencies",
      ],
    }),
    accessChapter,
    consoleChapter,
    dashboardChapter("organization"),
    inboxChapter,
    intakeChapter,
    contactsChapter,
    visitorChapter,
    knowledgeChapter,
    aiConsoleChapter,
    qualityChapter,
    reportsChapter,
    websitesChapter,
    departmentsChapter,
    routingChapter,
    staffChapter,
    orgSettingsChapter,
    securityChapter,
    auditChapter,
    platformChapter,
    notificationsChapter,
    profileChapter,
    privacyChapter,
    troubleshootingChapter,
    glossaryChapter,
    knowledgeCheck("super-admin", [
      {
        question: "Who may create or change another administrator?",
        options: ["Any administrator", "Only the highest administrative level", "Any manager", "Anyone with staff.view"],
        answer: 1,
        why: "Administering administrators is deliberately reserved, and the system refuses to remove the last administrator of an organization.",
      },
      {
        question: "You switch two-step verification to “required for everyone”. What should you do first?",
        options: [
          "Nothing, it is seamless",
          "Announce it in advance and make sure someone can help with lockouts",
          "Disable all accounts",
          "Reset every password",
        ],
        answer: 1,
        why: "Affected staff cannot sign in until they enrol. Warn them and staff the support path.",
      },
      {
        question: "Can data move between two organizations on the platform?",
        options: [
          "Yes, with an export",
          "No — tenant isolation is enforced in the database, not just the interface",
          "Only for administrators",
          "Only for knowledge articles",
        ],
        answer: 1,
        why: "Conversations, knowledge, contacts, staff and settings never cross a tenant boundary.",
      },
      {
        question: "You enter another organization for a support task. What is true?",
        options: [
          "Your actions are anonymous",
          "Every action is attributed to you in that tenant's audit log",
          "The audit log is skipped for platform roles",
          "You must disable logging first",
        ],
        answer: 1,
        why: "Platform access exists for justified support work, and it is fully attributed.",
      },
      {
        question: "What is the minimum safe administrator count per organization?",
        options: ["One", "Two", "Five", "It does not matter"],
        answer: 1,
        why: "A single administrator is a lockout waiting to happen; the system also refuses to remove the last one.",
      },
    ]),
  ],
};

const PLATFORM_GUIDE: Guide = {
  role: "platform_owner",
  label: "Platform Administration",
  tagline: "Operate CareConnect across every organization on the platform.",
  audience: "Platform owners, platform administrators and support staff.",
  duration: "About 60 minutes",
  chapters: [
    welcomeChapter({
      role: "platform_owner",
      lead: "You operate the platform itself: onboarding organizations, supporting their administrators and keeping every tenant correctly configured — without treating tenant data as browsable.",
      responsibilities: [
        "Onboarding new organizations, brands and websites",
        "Making sure each tenant has working administrators and routing",
        "Cross-organization reporting",
        "Supporting tenant administrators with configuration problems",
      ],
      boundaries: [
        "Casual access to tenant conversations or member records",
        "Changing a tenant's operational decisions without their administrator",
        "Editing the audit trail of any tenant",
      ],
      firstDay: [
        "Confirm your platform role and what it grants",
        "Review the list of organizations and their administrators",
        "Read the tenant isolation rules in this guide",
      ],
      firstWeek: [
        "Complete a per-tenant health check for every organization",
        "Onboard or rehearse onboarding one organization end to end",
        "Confirm support access procedures and justification requirements",
      ],
    }),
    accessChapter,
    consoleChapter,
    dashboardChapter("organization"),
    platformChapter,
    websitesChapter,
    departmentsChapter,
    routingChapter,
    staffChapter,
    orgSettingsChapter,
    securityChapter,
    auditChapter,
    reportsChapter,
    knowledgeChapter,
    privacyChapter,
    troubleshootingChapter,
    glossaryChapter,
    knowledgeCheck("platform", [
      {
        question: "What is the first thing a new organization needs after it is created?",
        options: [
          "An export",
          "Timezone, a website, staffed departments, routing and an administrator",
          "A quality review",
          "A knowledge check",
        ],
        answer: 1,
        why: "Without a staffed department and a catch-all rule, escalations have nowhere to land.",
      },
      {
        question: "When is it appropriate to open a tenant's conversation data?",
        options: [
          "Whenever you are curious",
          "Only for a specific, justified support task",
          "During onboarding demos",
          "To benchmark tenants against each other",
        ],
        answer: 1,
        why: "Platform access is for support, and every action is attributed in that tenant's audit log.",
      },
      {
        question: "How is tenant isolation enforced?",
        options: [
          "By hiding menu items",
          "In the database itself, underneath the interface",
          "By convention",
          "Only for conversations",
        ],
        answer: 1,
        why: "Isolation is enforced at the data layer, so a mistake in the interface cannot leak another tenant's data.",
      },
      {
        question: "A tenant reports escalations sitting unanswered. What do you check first?",
        options: [
          "Their brand colors",
          "Routing rules, department membership, business hours and staff availability",
          "The glossary",
          "Their CSV exports",
        ],
        answer: 1,
        why: "Unanswered escalations almost always trace back to routing, staffing or hours.",
      },
      {
        question: "Which change should never be made without the tenant's administrator?",
        options: [
          "Fixing a broken embed snippet",
          "Operational decisions such as roles, hours or published knowledge",
          "Checking their timezone",
          "Reading platform reports",
        ],
        answer: 1,
        why: "Tenants own their operations. Support fixes configuration faults; it does not make their decisions.",
      },
    ]),
  ],
};

export const GUIDES: Record<GuideRole, Guide> = {
  agent: AGENT_GUIDE,
  team_lead: TEAM_LEAD_GUIDE,
  manager: MANAGER_GUIDE,
  administrator: ADMINISTRATOR_GUIDE,
  super_admin: SUPER_ADMIN_GUIDE,
  platform_owner: PLATFORM_GUIDE,
};

export const GUIDE_ORDER: GuideRole[] = [
  "agent",
  "team_lead",
  "manager",
  "administrator",
  "super_admin",
  "platform_owner",
];

export function guideFor(role: GuideRole): Guide {
  return GUIDES[role] ?? GUIDES.agent;
}
