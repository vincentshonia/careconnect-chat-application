/**
 * Chapters every CareConnect role receives: getting into the console, moving
 * around it, the privacy rules that apply to everyone, troubleshooting and the
 * shared vocabulary. Sections carry permission gates where the underlying
 * screen is gated, so no reader is taught a screen they cannot open.
 */
import type { Chapter } from "../types";

export const accessChapter: Chapter = {
  id: "access",
  title: "Getting into CareConnect",
  intro: "Everything between your invitation email and your first look at the console.",
  sections: [
    {
      id: "access-accounts",
      title: "How staff accounts are created",
      summary: "Understand where your account comes from and why there is no public sign-up.",
      blocks: [
        {
          kind: "lead",
          text: "CareConnect has no public sign-up. Only an administrator in your organization can create staff access, which is why nobody outside your team can reach the console.",
        },
        {
          kind: "bullets",
          title: "There are exactly two ways you get an account",
          items: [
            "Direct creation — an administrator creates the account and gives you a work email and a one-time temporary password.",
            "Invitation link — an administrator sends you a single-use link that expires in 7 days and only works for the email address it was issued to.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Your access comes from your membership",
          text: "Signing in is not the same as belonging to an organization. If you sign in with an account that has no active membership, CareConnect shows a “no access” page instead of the console. Ask your administrator to add you.",
        },
      ],
    },
    {
      id: "access-first-sign-in",
      title: "Signing in for the first time",
      summary: "Get from the sign-in screen into the console.",
      blocks: [
        { kind: "figure", figure: "sign-in" },
        {
          kind: "steps",
          title: "If you were given an invitation link",
          items: [
            "Open the invitation link from your email. It looks like /invite?t=… and only works once.",
            "Sign in with the email address the invitation was sent to. Use Continue with Google if that address is a Google account, otherwise use the email and password fields.",
            "The invitation is accepted automatically and you land in the console.",
          ],
        },
        {
          kind: "steps",
          title: "If you were given a temporary password",
          items: [
            "Go to the console address your administrator gave you and stay on the /auth screen.",
            "Enter your work email and the temporary password exactly as provided.",
            "Select Sign in.",
            "Change the password straight away: open My settings, then Send password reset email, and follow the link.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Temporary passwords are shown once",
          text: "Your administrator cannot see the temporary password again after it is created. If you lose it before your first sign-in, use Forgot your password? on the sign-in screen or ask for a new invitation.",
        },
      ],
    },
    {
      id: "access-mfa",
      title: "Two-step verification",
      summary: "Set up an authenticator app and know what to expect when your organization requires it.",
      blocks: [
        {
          kind: "p",
          text: "Two-step verification adds a 6-digit code from an authenticator app on top of your password. Your organization can leave it optional, require it for administrators, or require it for everyone. When it is required for you, CareConnect sends you to the verification screen before the console loads.",
        },
        {
          kind: "steps",
          title: "Turn it on",
          items: [
            "Open the /mfa screen — either by following the prompt after sign-in, or from My settings, then Two-step verification.",
            "Choose to add an authenticator app. CareConnect shows a QR code.",
            "Scan the code with Google Authenticator, 1Password, Authy or a similar app. If you cannot scan, type the setup key shown under the code.",
            "Enter the 6-digit code your app displays and confirm.",
          ],
        },
        {
          kind: "steps",
          title: "Every sign-in after that",
          items: [
            "Sign in with your email and password (or Google).",
            "Open your authenticator app and read the current 6-digit code.",
            "Enter the code. Codes change roughly every 30 seconds — if it is about to expire, wait for the next one.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Lost your phone?",
          text: "Nobody can read your codes for you. Contact an administrator: they can remove the enrolled factor from your account so you can enrol a new device.",
        },
      ],
    },
    {
      id: "access-password-reset",
      title: "Resetting your password",
      summary: "Recover access without waiting for an administrator.",
      blocks: [
        {
          kind: "steps",
          items: [
            "On the sign-in screen, select Forgot your password?",
            "Enter your work email address and submit.",
            "Open the email and follow the reset link — it opens the reset-password screen.",
            "Enter a new password twice and save. You are signed in automatically.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Already signed in?",
          text: "You can send yourself the same reset email from My settings, under Notifications & security.",
        },
      ],
    },
    {
      id: "access-sign-out",
      title: "Signing out and shared computers",
      summary: "Leave a workstation safely.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Select Sign out at the bottom of the left sidebar.",
            "On a shared or public computer, also close the browser window.",
            "If you suspect someone else used your account, open Security (when your role includes it) and use Sign out other devices, then tell an administrator.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Why this matters",
          text: "Conversations can contain protected health information. An unattended, signed-in console is a privacy incident waiting to happen.",
        },
      ],
    },
  ],
};

export const consoleChapter: Chapter = {
  id: "console",
  title: "Finding your way around",
  intro: "The console layout is the same on every screen. Learn it once.",
  sections: [
    {
      id: "console-layout",
      title: "The layout",
      summary: "Name every part of the screen you are looking at.",
      blocks: [
        { kind: "figure", figure: "console-tour" },
        {
          kind: "bullets",
          items: [
            "Left sidebar — your organization's logo or name at the top, navigation in the middle, and theme, Collapse and Sign out at the bottom.",
            "Page header — the screen's title and a one-line description of what it does, plus the alert bell.",
            "Main area — the screen itself.",
          ],
        },
        {
          kind: "steps",
          title: "Try it now",
          items: [
            "Select Collapse at the bottom of the sidebar. The sidebar shrinks to icons; hover an icon to see its name.",
            "Select it again to expand.",
            "Select the theme item (Dark mode / Light mode) to switch appearance. Your choice is remembered on your account.",
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          title: "On a phone or tablet",
          text: "The sidebar is hidden. Use the menu button at the top-left of the header to open navigation, and it closes again as soon as you pick a screen.",
        },
      ],
    },
    {
      id: "console-navigation",
      title: "What each menu item does",
      summary: "Know where to go before you start clicking.",
      blocks: [
        {
          kind: "p",
          text: "Navigation is grouped into Workspace (day-to-day work), Content & AI (what the assistant knows and how well the team performs) and Configuration (how the platform behaves). You only see items your role allows — the list below marks who sees what.",
        },
        {
          kind: "table",
          caption: "Every navigation item in CareConnect",
          head: ["Menu item", "What it is for", "Who sees it"],
          rows: [
            ["Dashboard", "Your live workload, what needs attention, and your numbers", "Everyone"],
            ["Inbox", "Website chat conversations: claim, reply, resolve, close", "Everyone with chat access"],
            ["Intake", "Referral and enrollment requests from first contact to a decision", "Everyone with chat access"],
            ["Contacts", "The directory of visitors, leads and referral contacts", "Everyone with chat access"],
            ["Notifications", "Your alerts and how you want to receive them", "Everyone"],
            ["My settings", "Your profile, availability, appearance and security", "Everyone"],
            ["Knowledge", "Articles that power the assistant, and widget FAQs", "Everyone (editing needs Manager and above)"],
            ["AI console", "Test the assistant's answer to a question before visitors see it", "Manager and above"],
            ["Quality & QA", "Satisfaction scores, transcript review and agent scorecards", "Team Lead and above"],
            ["Reports", "Operational reporting and CSV exports", "Team Lead and above"],
            ["Websites", "Widget branding, copy, tabs and the embed snippet", "Administrator and above"],
            ["Departments", "Departments, business hours and holiday closures", "Administrator and above"],
            ["Routing", "Rules that send escalations to a department, plus reply templates", "Administrator and above"],
            ["Staff", "Add teammates, set roles, departments and capacity", "Team Lead can view; Administrator can change"],
            ["Organizations", "Tenants, brands and their websites", "Super Admin and platform administrators"],
            ["Organization settings", "Contact details, chatbot guardrails, compliance notices", "Administrator and above"],
            ["Security", "Organization MFA policy and your authenticator", "Super Admin and platform administrators"],
            ["Audit log", "Append-only history of who changed what", "Administrator and above"],
            ["Help & Training", "This training center: guides, checklists and knowledge checks", "Everyone"],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Missing an item you were told about?",
          text: "Nothing is broken: your role does not include it. Menu items, page guards and the database all enforce the same rules. Ask an administrator if you need access.",
        },
      ],
    },
    {
      id: "console-badges",
      title: "Badges, counts and alerts",
      summary: "Tell the two red numbers apart.",
      blocks: [
        {
          kind: "table",
          head: ["Where", "What the number means"],
          rows: [
            ["Red badge on Inbox", "Conversations waiting for a response right now, in the queues you can see"],
            ["Red badge on Notifications", "Your unread alerts"],
            ["Red dot on the bell in the header", "The same unread alert count, available from any screen"],
          ],
        },
        {
          kind: "p",
          text: "Both update live — you do not need to refresh the page. A number that stays high usually means work is genuinely waiting, not that the badge is stuck.",
        },
      ],
    },
  ],
};

export const privacyChapter: Chapter = {
  id: "privacy",
  title: "Privacy, safety and the audit trail",
  intro: "The rules that apply to every role, every day.",
  sections: [
    {
      id: "privacy-phi",
      title: "Handling protected health information",
      summary: "Know what you may write, where, and to whom.",
      blocks: [
        {
          kind: "lead",
          text: "Visitors tell CareConnect real things about their health, coverage and living situation. Treat every conversation, contact record and intake request as protected health information.",
        },
        {
          kind: "doDont",
          dos: [
            "Keep member details inside CareConnect, where access is controlled and every change is logged.",
            "Use Staff notes on a contact for internal context — visitors never see them.",
            "Verify who you are speaking to before discussing specifics of someone's coverage.",
            "Share only what the visitor needs for the next step.",
          ],
          donts: [
            "Never paste member details into external tools, personal notes, spreadsheets or chat apps.",
            "Never take screenshots of transcripts to share outside the platform.",
            "Never email or text member information from your own account.",
            "Never leave the console open on an unattended screen.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Your photo and name are private by default",
          text: "Website visitors only see your name and photo if you switch on “Show my name and photo to website visitors” in My settings. It is off unless you turn it on.",
        },
      ],
    },
    {
      id: "privacy-crisis",
      title: "Emergencies and crisis language",
      summary: "React correctly when someone is in danger.",
      blocks: [
        {
          kind: "p",
          text: "The assistant recognises crisis language and replies with your organization's emergency message before anything else. That message is configured in Organization settings and shown to the visitor immediately.",
        },
        {
          kind: "steps",
          title: "If a visitor describes an emergency or self-harm",
          items: [
            "Stay in the conversation. Do not transfer and walk away.",
            "Repeat the emergency guidance in plain words: if there is immediate danger, they should call 911.",
            "Do not attempt clinical advice, triage or diagnosis — CareConnect is not a clinical tool.",
            "Escalate to a supervisor immediately and note what happened in the conversation.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Never promise an outcome",
          text: "Do not promise eligibility, coverage, approval, timelines or payment. Say what the next step is and who will follow up.",
        },
      ],
    },
    {
      id: "privacy-audit",
      title: "What gets recorded",
      summary: "Understand the audit trail that sits behind your work.",
      blocks: [
        {
          kind: "bullets",
          items: [
            "Sign-ins, role changes, staff changes, settings changes and record edits are written to an append-only audit log.",
            "Conversation events — claims, transfers, reassignments, resolutions and closures — are recorded with who did them and when.",
            "Audit entries cannot be edited or deleted by anyone, including administrators.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "This protects you too",
          text: "When a decision is questioned weeks later, the log shows exactly what happened and who acted. Work normally; the trail is there to support good work, not to catch you out.",
        },
      ],
    },
  ],
};

export const troubleshootingChapter: Chapter = {
  id: "troubleshooting",
  title: "When something looks wrong",
  intro: "Fix the everyday problems yourself, and know when to ask.",
  sections: [
    {
      id: "trouble-common",
      title: "Common problems and their fixes",
      summary: "Work through the usual suspects before raising a ticket.",
      blocks: [
        {
          kind: "faq",
          items: [
            {
              q: "I signed in but I see a “no access” page.",
              a: "Your account exists but has no active membership in an organization. Ask an administrator to add you, or to re-enable your account if it was disabled.",
            },
            {
              q: "A menu item my colleague has is missing for me.",
              a: "Your role does not include it. Roles are cumulative — a Manager sees everything a Team Lead sees, and so on. Ask an administrator if the work you have been given needs a different role.",
            },
            {
              q: "I opened a conversation but there is no reply box.",
              a: "Either the conversation is closed, or it is unassigned, or a colleague owns it. Unassigned chats must be claimed first — that is what the Claim conversation button is for. A “View only” badge means you may read but not reply.",
            },
            {
              q: "I pressed Claim and got an error.",
              a: "Someone claimed it a moment before you, or you are already at your maximum simultaneous chats. Refresh the queue: if the conversation now shows another owner, it is handled.",
            },
            {
              q: "The Inbox badge shows waiting chats, but my Waiting tab is empty.",
              a: "The badge counts what is waiting across the queues you can see, including departments you are not a member of if your role can view them. Check the Department and All conversations tabs when your role has them.",
            },
            {
              q: "My dashboard numbers look different from a colleague's.",
              a: "Dashboards are scoped to what you may see: your own work, your departments, or the whole organization. Different roles legitimately see different totals for the same day.",
            },
            {
              q: "“Today” does not match my clock.",
              a: "Every date calculation uses your organization's timezone, not your browser's. An administrator sets it in Organization settings.",
            },
            {
              q: "I cannot open a visitor's attachment.",
              a: "Attachment links are generated on demand and expire. Return to the transcript and select View or Save again rather than reusing an old link.",
            },
            {
              q: "The AI answered something incorrect.",
              a: "Note the exact question. Anyone with knowledge editing rights can reproduce it in the AI console and fix the underlying article. Do not correct the visitor's record of what the assistant said — reply with the right answer instead.",
            },
            {
              q: "The page will not load or looks broken.",
              a: "Refresh once. If it persists, sign out and back in. If it still fails, tell an administrator what screen you were on and what you were doing.",
            },
          ],
        },
      ],
    },
    {
      id: "trouble-escalate",
      title: "Who to ask",
      summary: "Send the question to the right person the first time.",
      blocks: [
        {
          kind: "table",
          head: ["Question", "Who can resolve it"],
          rows: [
            ["I need access to a screen", "An administrator in your organization"],
            ["My role or departments are wrong", "An administrator (roles) or your team lead (departments)"],
            ["A conversation is with the wrong team", "Your team lead — they can transfer or reassign it"],
            ["The assistant needs better information", "A manager or administrator with knowledge editing rights"],
            ["Business hours, holidays or routing are wrong", "An administrator"],
            ["Something on the widget looks wrong on the public site", "An administrator (Websites)"],
            ["A possible privacy or security incident", "An administrator immediately, then follow your internal policy"],
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          title: "Make the ask easy to answer",
          text: "Include the screen you were on, the reference number (for example PHG-2041 or INT-1042), what you expected and what happened instead.",
        },
      ],
    },
  ],
};

export const glossaryChapter: Chapter = {
  id: "glossary",
  title: "Words CareConnect uses",
  intro: "The vocabulary on screen, in plain English.",
  sections: [
    {
      id: "glossary-terms",
      title: "Glossary",
      summary: "Decode any label you meet in the console.",
      blocks: [
        {
          kind: "terms",
          items: [
            {
              term: "Organization (tenant)",
              definition:
                "One customer of the platform. Conversations, knowledge, staff and settings never cross between organizations.",
            },
            {
              term: "Website",
              definition:
                "A public site where the chat widget is embedded. Each website has its own branding, copy and assistant instructions.",
            },
            {
              term: "Widget",
              definition: "The chat panel a visitor sees on the public website.",
            },
            {
              term: "Conversation",
              definition:
                "One chat thread with a visitor, identified by a reference such as PHG-2041.",
            },
            {
              term: "Claim",
              definition:
                "Taking ownership of a waiting conversation. Only the owner (or a supervisor) may reply.",
            },
            {
              term: "Escalation",
              definition:
                "The moment a visitor asks for a human, or the assistant decides a person is needed.",
            },
            {
              term: "Transfer",
              definition: "Moving a conversation to a different department queue.",
            },
            {
              term: "Reassignment",
              definition: "Moving a conversation to a different person in the same department.",
            },
            {
              term: "Department",
              definition:
                "A routing target — the team that receives certain escalations, with its own hours and members.",
            },
            {
              term: "Capacity",
              definition:
                "The maximum simultaneous chats a person may own. Routing respects it.",
            },
            {
              term: "Presence",
              definition: "Your availability: Available, Busy, Away or Offline.",
            },
            {
              term: "SLA",
              definition:
                "The first-response target in minutes. A conversation that waits longer counts as a breach.",
            },
            {
              term: "CSAT",
              definition:
                "Visitor satisfaction, from the star rating a visitor gives after a chat.",
            },
            {
              term: "Intake request",
              definition:
                "A referral, enrollment, callback or general request captured from the widget, identified by a reference such as INT-1042.",
            },
            {
              term: "Contact",
              definition: "The person record behind conversations and intake requests.",
            },
            {
              term: "Knowledge article",
              definition:
                "Approved content the assistant searches when answering. Published articles are the assistant's source of truth.",
            },
            {
              term: "FAQ",
              definition: "A short question and answer pair shown directly in the widget.",
            },
            {
              term: "Audit log",
              definition: "The append-only record of who changed what, and when.",
            },
          ],
        },
      ],
    },
    {
      id: "glossary-statuses",
      title: "Conversation and request statuses",
      summary: "Read any status badge correctly.",
      blocks: [
        {
          kind: "table",
          caption: "Conversation statuses, exactly as the Inbox labels them",
          head: ["Badge", "Meaning"],
          rows: [
            ["AI handling", "The assistant is answering; no person is needed yet"],
            ["Waiting for human", "A person is needed and nobody has claimed it"],
            ["Claimed", "Someone owns it but the conversation is not active yet"],
            ["Active", "A live back-and-forth is happening"],
            ["Waiting for visitor", "The ball is in the visitor's court"],
            ["Internal follow-up", "Waiting on internal work before the visitor hears back"],
            ["Follow-up", "Scheduled to be picked up again"],
            ["Escalated", "Explicitly raised for human help"],
            ["Resolved", "Finished with the visitor's need met"],
            ["Closed", "Finished without a resolution"],
            ["Spam", "Junk, excluded from reporting"],
            ["Archived", "Removed from active queues, retained for the record"],
          ],
        },
        {
          kind: "table",
          caption: "Intake stages, in the order work normally moves",
          head: ["Stage", "Meaning"],
          rows: [
            ["new", "Just arrived, nobody has looked at it"],
            ["in review", "Being assessed by staff"],
            ["contacted", "The person has been reached"],
            ["eligibility check", "Verifying qualification"],
            ["submitted", "Sent onward for a decision"],
            ["approved", "Accepted"],
            ["denied", "Not accepted"],
            ["withdrawn", "The person no longer wants to proceed"],
          ],
        },
      ],
    },
  ],
};

export const helpChapter: Chapter = {
  id: "help-center",
  title: "Using Help & Training",
  intro: "How this training center works, and where to go when the guide does not answer your question.",
  sections: [
    {
      id: "help-how-to-use",
      title: "How to use this guide",
      summary: "Find, read, tick off and print the parts you need.",
      blocks: [
        {
          kind: "lead",
          text: "Help & Training is always in the Workspace group of the left sidebar. It opens on the guide for your own role, and everything you see here matches what your account can actually do.",
        },
        {
          kind: "steps",
          title: "The controls at the top of the page",
          items: [
            "Guide selector — if your role supervises other roles you can also read their guides. Standard Users see only their own.",
            "Start here / Continue — jumps to the first section you have not finished.",
            "Print or save as PDF — opens your browser's print dialog with the whole guide expanded. Choose “Save as PDF” as the destination to keep a copy.",
            "Restart guide — clears your ticks for the guide you are reading. It never affects anyone else.",
          ],
        },
        {
          kind: "steps",
          title: "Reading and tracking",
          items: [
            "Use the Search this guide box to filter both the contents list and the page. Try a word you saw on screen, such as claim, transfer, holiday or password.",
            "Select any entry in Contents to jump to that section.",
            "Select Mark complete when you have actually done the thing the section describes — not just read it.",
            "Use Collapse all to skim the headings, then Expand all when you want the detail back.",
            "Previous and Next at the bottom of each section move you through the guide in order.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Your progress is saved on this device",
          text: "Ticks are stored in this browser against your own account, so a shared workstation never mixes two people's progress. Sign in on a different computer and you will start with an empty checklist there.",
        },
        {
          kind: "callout",
          tone: "tip",
          title: "Illustrations, not screenshots",
          text: "Every picture in this guide is a drawn diagram of the console using the real labels and colours, with numbered markers explained underneath. They contain invented names and numbers on purpose, so no real member or colleague data is ever shown in training material.",
        },
      ],
    },
    {
      id: "help-need-help",
      title: "Need help beyond this guide?",
      summary: "Get an answer quickly, without putting member data at risk.",
      blocks: [
        {
          kind: "steps",
          title: "In this order",
          items: [
            "Search this guide — most questions are answered in the chapter for the screen you are on.",
            "Check the “When something looks wrong” chapter for the common problems and their fixes.",
            "Ask your team lead for anything about the day's work: queues, transfers, priorities.",
            "Ask an administrator for anything about access, roles, departments, routing, hours or settings.",
            "Report anything that looks like a privacy or security problem to an administrator immediately, and follow your internal policy.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Never paste member details into a help request",
          text: "Use the reference number instead — for example PHG-2041 or INT-1042 — and describe what you expected and what happened. Names, dates of birth, member numbers and health details stay inside CareConnect.",
        },
        {
          kind: "callout",
          tone: "note",
          title: "Something in this guide looks out of date?",
          text: "Tell an administrator. Administrators and Super Admins can flag the guide for review from the top of this page, which leaves a visible note for the rest of the organization until the material is corrected.",
        },
      ],
    },
  ],
};
