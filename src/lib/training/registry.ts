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
  helpChapter,
  privacyChapter,
  troubleshootingChapter,
} from "./content/common";
import { TRAINING_APP_BUILD, formatReviewDate } from "./version";
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

type WrapUpInput = {
  /** Prefix for the section ids, unique per guide. */
  id: string;
  mistakes: string[];
  dos: string[];
  donts: string[];
  checklist: string[];
};

/** Common mistakes plus the "am I ready?" checklist that closes every guide. */
function wrapUpChapter(input: WrapUpInput): Chapter {
  return {
    id: "wrap-up",
    title: "Common mistakes and your final checklist",
    intro: "What goes wrong most often, and how to prove to yourself that you are ready.",
    sections: [
      {
        id: `${input.id}-mistakes`,
        title: "Common mistakes to avoid",
        summary: "Recognise the five habits that cause most of the rework.",
        blocks: [
          {
            kind: "bullets",
            title: "Seen most often in the first few weeks",
            items: input.mistakes,
          },
          { kind: "doDont", dos: input.dos, donts: input.donts },
          {
            kind: "callout",
            tone: "warning",
            title: "A mistake is only a problem if you hide it",
            text: "Every action is recorded with your name against it. If you send the wrong information, reply again with the correction and tell your team lead — do not try to make the record look tidier than it is.",
          },
        ],
      },
      {
        id: `${input.id}-final-checklist`,
        title: "Final checklist",
        summary: "Tick every line before you work unsupervised.",
        blocks: [
          { kind: "checklist", title: "I can do all of this without help", items: input.checklist },
          {
            kind: "callout",
            tone: "note",
            title: "Keeping this guide honest",
            text: `This material was last reviewed on ${formatReviewDate()} against application build ${TRAINING_APP_BUILD}. If a screen in the console no longer matches what you read here, tell an administrator so the guide can be corrected.`,
          },
        ],
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
    helpChapter,
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
    wrapUpChapter({
      id: "agent",
      mistakes: [
        "Typing a reply before claiming — an unclaimed conversation has no reply box, and the visitor waits while you look for it.",
        "Leaving your availability on Away after a break, so routing skips you and the queue builds up.",
        "Closing a conversation that was actually solved: Resolve means the need was met, Close means it ended without one.",
        "Writing member details into a personal note, spreadsheet or chat app instead of the contact record.",
        "Promising an outcome — approval, coverage or a date — instead of explaining the next step.",
      ],
      dos: [
        "Claim, reply within your first-response target, then resolve or close deliberately.",
        "Record what you learn on the contact record while the conversation is still open.",
        "Say “let me check that for you” and use the knowledge base rather than guessing.",
        "Repeat the emergency guidance and escalate immediately when a visitor describes danger.",
      ],
      donts: [
        "Do not copy transcripts, attachments or member details out of CareConnect.",
        "Do not give clinical advice, diagnoses or eligibility decisions.",
        "Do not use a transfer to end your shift early — hand over with a note instead.",
        "Do not write anything in a staff note you would not want the member to read.",
      ],
      checklist: [
        "Sign in, complete two-step verification and change my temporary password",
        "Set my availability and understand how it affects routing",
        "Claim a waiting conversation and reply inside the target time",
        "Send and open an attachment safely",
        "Transfer or escalate correctly when the request is not mine to answer",
        "Resolve and close conversations for the right reasons",
        "Create and update a contact record with a useful staff note",
        "Move an intake request to its next stage",
        "Explain what I must never promise a visitor",
        "Say who I escalate to and how I raise a privacy concern",
      ],
    }),
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
    helpChapter,
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
    wrapUpChapter({
      id: "team-lead",
      mistakes: [
        "Reassigning to whoever is at the top of the list instead of reading the eligibility reasons next to each name.",
        "Overriding an ineligible target without a written reason, when the reason is what protects you later.",
        "Watching the waiting count climb instead of claiming the oldest conversation yourself.",
        "Coaching someone about a low rating in a shared channel rather than privately.",
        "Transferring a conversation without telling the visitor what is about to happen.",
      ],
      dos: [
        "Check queue age, not just queue size — the oldest waiting figure is the visitor's experience.",
        "Transfer between departments, reassign within one, and explain the difference to your team.",
        "Use the department view to spot a teammate who is at capacity before they ask.",
        "Review one high and one low satisfaction transcript every week.",
      ],
      donts: [
        "Do not reply inside a conversation you do not own — claim or assign it first.",
        "Do not use reassignment to punish or reward; capacity and skills decide.",
        "Do not discuss an individual's numbers with the rest of the team.",
        "Do not leave a department without an available owner during published hours.",
      ],
      checklist: [
        "Everything on the Standard User checklist",
        "Read a department queue and say what needs action first",
        "Transfer a conversation to another department and explain why",
        "Reassign within my department using the eligibility list",
        "Explain what makes a teammate ineligible and when an override is justified",
        "Run the 60-second team check on my dashboard",
        "Open Quality & QA and review a transcript with a rating attached",
        "Produce a report for my departments and export it",
        "Coach one person privately using evidence from the platform",
      ],
    }),
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
    helpChapter,
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
    wrapUpChapter({
      id: "manager",
      mistakes: [
        "Publishing an article to “get it live” and correcting it later — publishing is immediate and the assistant starts quoting it at once.",
        "Fixing a wrong AI answer by telling staff to correct visitors, instead of correcting the article behind it.",
        "Putting one-off exceptions, internal ticket numbers or direct phone numbers into published knowledge.",
        "Comparing report figures with a colleague without checking that both used the same date range and scope.",
        "Reviewing quality only when something goes wrong, so nobody hears what good looks like.",
      ],
      dos: [
        "Draft, read aloud, then publish — assume every published sentence will be quoted word for word.",
        "Reproduce a reported bad answer in the AI console before changing anything.",
        "Retire outdated articles rather than leaving two versions of the truth.",
        "Share report findings with the team, not just the numbers.",
      ],
      donts: [
        "Do not paste member details into an article, a template or a test question.",
        "Do not change published guidance that belongs to compliance without checking first.",
        "Do not treat the dashboard as the record — Reports is the record.",
        "Do not leave an article published when you know it is wrong; unpublish it now, fix it next.",
      ],
      checklist: [
        "Everything on the Team Lead checklist",
        "Create, edit, publish and unpublish a knowledge article",
        "Explain what happens to the assistant the moment I publish",
        "Test a real visitor question in the AI console and read the sources it used",
        "Reorder the widget FAQs to match real demand",
        "Run a quality review cycle and record the outcome",
        "Build a report with department and date filters and export it",
        "Explain why two roles can legitimately see different totals",
      ],
    }),
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
    helpChapter,
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
    wrapUpChapter({
      id: "administrator",
      mistakes: [
        "Creating an account and closing the dialog without copying the temporary password — it cannot be shown again.",
        "Disabling a leaver's account before reassigning their open conversations and intake requests.",
        "Publishing a website without a catch-all routing rule, so unmatched escalations wait with nobody to answer them.",
        "Changing the organization timezone quietly — every report, “today” figure and business-hours calculation moves with it.",
        "Giving someone a higher role “temporarily” and never reviewing it.",
      ],
      dos: [
        "Prefer an invitation link over a temporary password when the person has a working mailbox.",
        "Give the lowest role that lets someone do their job, and review roles when duties change.",
        "Keep every department staffed, with hours and holidays that match reality.",
        "Read the audit log weekly and ask about anything you cannot explain.",
      ],
      donts: [
        "Do not share one account between several people — attribution is what makes the audit log useful.",
        "Do not remove the last administrator of an organization; the system will refuse, and for good reason.",
        "Do not test routing changes during a busy period without telling the team.",
        "Do not store credentials or member details in department names, notes or website copy.",
      ],
      checklist: [
        "Everything on the Manager checklist",
        "Create a staff account and send an invitation, and know when to use each",
        "Change a role, department membership and capacity, and explain the effect",
        "Disable and re-enable an account, in the right order relative to their open work",
        "Configure a website: branding, welcome copy, tabs and the embed snippet",
        "Create a department with business hours and a holiday closure",
        "Write routing rules with a working catch-all and test the order",
        "Set organization details, timezone, guardrails and compliance notices",
        "Filter and read the audit log, and explain why it cannot be edited",
      ],
    }),
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
    helpChapter,
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
    wrapUpChapter({
      id: "super-admin",
      mistakes: [
        "Leaving an organization with a single administrator, which turns one lost phone into a lockout.",
        "Requiring two-step verification for everyone without announcing it, so staff arrive to a screen they cannot pass.",
        "Appointing an administrator without agreeing who reviews their changes.",
        "Opening tenant data because you can, rather than because a task requires it.",
        "Assuming platform actions are invisible — every one is attributed in that tenant's audit log.",
      ],
      dos: [
        "Keep at least two administrators in every organization and check it regularly.",
        "Announce authentication policy changes in advance and staff the lockout path.",
        "Review role and security changes in the audit log as a routine, not an investigation.",
        "Document who covers access emergencies when you are unavailable.",
      ],
      donts: [
        "Do not bypass conversation ownership rules for convenience.",
        "Do not move or copy data between organizations; isolation is enforced beneath the interface.",
        "Do not grant a platform role to solve a tenant-level access problem.",
        "Do not make an operational decision that belongs to a tenant's administrator.",
      ],
      checklist: [
        "Everything on the Administrator checklist",
        "Appoint and remove an administrator, and explain the last-administrator rule",
        "Set the organization's two-step verification policy and plan the rollout",
        "Help someone recover from a lost authenticator device",
        "Create an organization or brand and configure its first website",
        "Confirm every tenant has a timezone, staffed departments and a catch-all rule",
        "Read the security screen and explain what each control changes",
        "Describe exactly what is recorded when I act inside another organization",
      ],
    }),
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
    helpChapter,
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
    wrapUpChapter({
      id: "platform",
      mistakes: [
        "Handing over a new organization before it has a staffed department and a catch-all routing rule.",
        "Fixing a tenant's operational setting without their administrator's agreement.",
        "Browsing tenant conversations for context instead of asking the tenant.",
        "Comparing one tenant's figures with another's in front of either of them.",
        "Forgetting that support access is attributed in the tenant's own audit log.",
      ],
      dos: [
        "Run the same health check for every tenant: timezone, website, departments, hours, routing, administrators.",
        "Record why you entered a tenant before you do it.",
        "Fix configuration faults; escalate operational decisions to the tenant.",
        "Confirm each new organization has two working administrators before go-live.",
      ],
      donts: [
        "Do not treat tenant data as browsable, demo material or benchmarking input.",
        "Do not edit or attempt to reorder any tenant's audit trail.",
        "Do not leave a platform role assigned to someone who no longer needs it.",
        "Do not use a platform role to work around a tenant's own access rules.",
      ],
      checklist: [
        "Explain what my platform role grants and what it does not",
        "Onboard an organization end to end, including its first website",
        "Complete a per-tenant health check and record the result",
        "State the rule for when tenant data may be opened",
        "Describe how tenant isolation is enforced beneath the interface",
        "Show where my actions appear in a tenant's audit log",
        "Hand a configuration decision back to the right tenant administrator",
      ],
    }),
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
