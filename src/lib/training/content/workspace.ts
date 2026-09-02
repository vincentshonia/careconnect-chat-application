/**
 * Workspace chapters: the screens staff use every shift. The dashboard chapter
 * is built per scope because the dashboard genuinely renders different panels
 * for personal, team and organization-wide reach.
 */
import type { Chapter } from "../types";

export type DashboardScope = "self" | "team" | "organization";

export function dashboardChapter(scope: DashboardScope): Chapter {
  const figure =
    scope === "organization" ? "dashboard-org" : scope === "team" ? "dashboard-team" : "dashboard-self";

  const chapter: Chapter = {
    id: "dashboard",
    title: "Your dashboard",
    intro:
      scope === "organization"
        ? "The first screen after sign-in, showing the whole organization's live position."
        : scope === "team"
          ? "The first screen after sign-in, covering your own work and your departments."
          : "The first screen after sign-in, showing your work and what you can pick up.",
    sections: [
      {
        id: "dashboard-orientation",
        title: "What the dashboard is for",
        summary: "Read the screen in the order it is designed to be read.",
        blocks: [
          { kind: "figure", figure },
          {
            kind: "p",
            text: "The dashboard answers three questions in order: what is happening right now, what needs me next, and how am I (or my team) doing. Work top to bottom and you will not miss anything urgent.",
          },
          {
            kind: "steps",
            title: "Start of shift, every day",
            items: [
              "Set your availability in the header — Available, Busy, Away or Offline. Routing only sends new work to people who are available and under capacity.",
              "Read Right now for the live position.",
              "Work through Needs my attention from the top; it is already ordered by urgency.",
              "Check Available conversations for waiting visitors you can claim.",
            ],
          },
          {
            kind: "callout",
            tone: "tip",
            title: "Availability is not cosmetic",
            text: "Leaving yourself Available while you are away holds work in a queue nobody is watching. Set Away when you step out, and Offline at the end of your shift.",
          },
        ],
      },
      {
        id: "dashboard-right-now",
        title: "Right now",
        summary: "Interpret every live counter correctly.",
        blocks:
          scope === "organization"
            ? [
                {
                  kind: "table",
                  caption: "Organization-wide live counters",
                  head: ["Counter", "What it counts"],
                  rows: [
                    ["Open", "Every conversation not yet resolved or closed"],
                    ["Waiting", "Conversations needing a person that nobody owns"],
                    ["Unassigned", "Open conversations with no owner"],
                    ["Active", "Conversations in live back-and-forth"],
                    ["Agent requested", "Visitors who explicitly asked for a human"],
                    ["Completed today", "Resolved or closed today, in your organization's timezone"],
                    ["SLA risk", "Conversations at risk of missing the first-response target"],
                    ["Open intakes", "Referral and enrollment requests still open"],
                  ],
                },
                {
                  kind: "p",
                  text: "Every counter is a link. Selecting Waiting opens the Inbox already filtered to the waiting queue; selecting Open intakes opens Intake. Use them as shortcuts rather than filtering by hand.",
                },
              ]
            : [
                {
                  kind: "table",
                  caption: "Your live counters",
                  head: ["Counter", "What it counts"],
                  rows: [
                    ["My open", "Conversations you own that are not finished"],
                    ["My active", "Your conversations in live back-and-forth"],
                    ["Waiting in my department", "Conversations waiting for a person in your departments"],
                    ["Completed today", "Conversations you resolved or closed today"],
                    ["SLA risk", "Your conversations at risk of missing the first-response target"],
                    ["My capacity", "Your active chats against the maximum your administrator set"],
                  ],
                },
                {
                  kind: "p",
                  text: "Each counter is a shortcut: selecting it opens the Inbox filtered to exactly those conversations.",
                },
              ],
      },
      {
        id: "dashboard-attention",
        title: "Needs my attention",
        summary: "Clear the urgent list without guesswork.",
        blocks: [
          {
            kind: "p",
            text: "This panel lists work in urgency order: visitors waiting, conversations at SLA risk, escalations, then follow-ups. Each row shows the visitor or contact name, the subject, why it is listed, how long it has been waiting and the department.",
          },
          {
            kind: "steps",
            items: [
              "Select a row to open that conversation in the Inbox.",
              "Deal with it — claim it, reply, or resolve it.",
              "Return to the dashboard; the row disappears once the reason no longer applies.",
            ],
          },
          {
            kind: "callout",
            tone: "note",
            title: "An empty panel is a good sign",
            text: "Nothing urgent is outstanding in your scope. Use the time for follow-ups and intake work.",
          },
        ],
      },
      {
        id: "dashboard-performance",
        title: "My performance",
        summary: "Understand your own numbers before anyone else discusses them.",
        blocks: [
          {
            kind: "p",
            text: "Choose a period — Today, This week, Last 7 days, This month or Last 30 days — and the panel recalculates. Arrows compare the current period with the one before it.",
          },
          {
            kind: "table",
            head: ["Metric", "What it means"],
            rows: [
              ["Conversations claimed", "How many you took ownership of"],
              ["Conversations handled", "How many you actually worked"],
              ["Resolved / Closed", "Finished with the need met / finished without a resolution"],
              ["Completion rate", "Completed conversations divided by conversations you handled"],
              ["Avg. first response", "How long visitors waited for your first reply"],
              ["Median first response", "Your typical reply speed, shown once you have enough volume"],
              ["Avg. time to claim", "How quickly you pick work up"],
              ["Avg. handle time", "From claim to resolution or closure"],
              ["SLA compliance", "Share of eligible conversations answered inside the target"],
              ["Visitor satisfaction", "Your average star rating, once visitors have rated you"],
              ["Department average response", "A privacy-safe benchmark — the department average, never an individual colleague"],
            ],
          },
          {
            kind: "callout",
            tone: "privacy",
            title: "You cannot see a colleague's individual numbers here",
            text: "Comparisons are against the department average by design. Individual performance is only visible to roles responsible for coaching.",
          },
        ],
      },
      {
        id: "dashboard-queue",
        title: "Available conversations",
        summary: "Pick up waiting work safely.",
        blocks: [
          {
            kind: "p",
            text: "This panel lists waiting visitors you are eligible to claim, with how long they have been waiting, the department, and an “Agent requested” badge when the visitor asked for a person by name.",
          },
          {
            kind: "steps",
            items: [
              "Read the oldest waiting item first.",
              "Select Claim on that row.",
              "You are now the owner; open it in the Inbox and reply.",
            ],
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Claiming can fail — and that is fine",
            text: "If a colleague claimed it a second earlier, or you are at capacity, the claim is refused. Nothing is lost; move to the next item.",
          },
          { kind: "p", text: "When the panel says “The queue is clear.”, nobody is waiting." },
        ],
      },
    ],
  };

  if (scope !== "self") {
    chapter.sections.push({
      id: "dashboard-team-panels",
      title: scope === "organization" ? "Department and staff panels" : "Your departments and team",
      summary: "Use the team view to spot trouble before it becomes a complaint.",
      gate: { anyOf: ["reports.team", "reports.organization", "reports.platform"] },
      blocks: [
        {
          kind: "bullets",
          items: [
            "Staff availability — live counts of who is Available, Busy, Away, Offline and who is at capacity.",
            scope === "organization"
              ? "Department performance — every department: open, waiting, active, completed today, oldest waiting, SLA risk, average response, SLA % , CSAT and available staff."
              : "My departments — the same queue-health figures for the departments you belong to.",
            scope === "organization"
              ? "Agent workload — presence, active against capacity, waiting replies, completed today, average response and SLA % for staff in your scope."
              : "My team today — presence, live workload and today's outcomes for your teammates.",
            "Requests — referral and enrollment workload, including anything overdue.",
          ],
        },
        {
          kind: "steps",
          title: "The 60-second team check",
          items: [
            "Look at Waiting and Oldest waiting per department — anything growing needs a person now.",
            "Compare available staff against waiting work; if nobody is available, reassign or step in yourself.",
            "Scan for teammates at capacity and rebalance before the queue backs up.",
            "Select any row to open the full report for that department or person.",
          ],
        },
      ],
    });
  }

  if (scope === "organization") {
    chapter.sections.push({
      id: "dashboard-org-overview",
      title: "Organization overview and AI vs human assistance",
      summary: "Read the tenant-level trend without opening Reports.",
      gate: { anyOf: ["reports.organization", "reports.platform"] },
      blocks: [
        {
          kind: "bullets",
          items: [
            "Organization overview — totals for the selected period: conversations, human assistance requests, claimed, completed, resolved, closed without resolution, reopened, transfer rate, average first response, average resolution, SLA compliance, satisfaction and escalations.",
            "AI vs human assistance — how much the assistant deflects: AI handled, human assisted and the escalation rate.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Dashboard is live; Reports is the record",
          text: "Use the dashboard to run the day. Use Reports when you need filters, drill-downs or an export to share.",
        },
      ],
    });
  }

  return chapter;
}

export const inboxChapter: Chapter = {
  id: "inbox",
  title: "The Inbox",
  intro: "Where every website conversation is claimed, answered and finished.",
  gate: { anyOf: ["conversation.view_assigned"] },
  sections: [
    {
      id: "inbox-layout",
      title: "How the Inbox is laid out",
      summary: "Find any conversation in three moves.",
      blocks: [
        { kind: "figure", figure: "inbox" },
        {
          kind: "bullets",
          items: [
            "Header — a search box for reference or subject, and the queue tabs.",
            "Left column — the conversation list for the selected queue, newest activity first.",
            "Middle column — the transcript, with action buttons across the top and the reply box at the bottom.",
            "Right column — visitor details captured by the widget.",
          ],
        },
        {
          kind: "table",
          caption: "Queue tabs",
          head: ["Tab", "What it shows"],
          rows: [
            ["Waiting", "Conversations needing a person that nobody owns yet"],
            ["Mine", "Conversations you own"],
            ["Department", "Everything in your departments"],
            ["Active", "Live conversations happening now"],
            ["Closed", "Finished conversations"],
            ["All conversations", "Every conversation in the organization — only for roles that may see everything"],
          ],
        },
        {
          kind: "p",
          text: "Long queues are paged. Use Prev and Next under the list; the counter shows which records you are looking at out of the total.",
        },
      ],
    },
    {
      id: "inbox-claim",
      title: "Claiming a conversation",
      summary: "Take ownership so you can reply.",
      gate: { anyOf: ["conversation.claim"] },
      blocks: [
        {
          kind: "lead",
          text: "Unassigned conversations have no reply box. Claiming is what makes you the owner, and only one person can own a conversation at a time.",
        },
        {
          kind: "steps",
          items: [
            "Open the Waiting tab.",
            "Select a conversation to read what the visitor and the assistant have already said.",
            "Select Claim conversation in the header. The button briefly reads “Claiming…”.",
            "A confirmation appears — “You now own this conversation” — the badge changes to Assigned to you and the reply box appears.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "If the claim fails",
          text: "Claims are first-come, first-served and capacity-aware. “Could not claim this conversation” means a colleague got there first or you are at your maximum simultaneous chats. Pick another item.",
        },
        {
          kind: "bullets",
          title: "You can only claim conversations that are",
          items: [
            "waiting for a human, newly escalated, or marked for follow-up,",
            "in a department you can see,",
            "not already owned by someone else.",
          ],
        },
      ],
    },
    {
      id: "inbox-reply",
      title: "Replying to a visitor",
      summary: "Answer clearly, quickly and safely.",
      gate: { anyOf: ["conversation.reply", "conversation.reply_assigned"] },
      blocks: [
        {
          kind: "steps",
          items: [
            "Read the whole transcript first — the assistant has usually already answered part of the question.",
            "Type in the reply box at the bottom.",
            "Press Enter to send. Press Shift+Enter for a new line inside the same message.",
            "The visitor sees your message immediately; you do not need to refresh.",
          ],
        },
        {
          kind: "bullets",
          title: "Reading the transcript",
          items: [
            "Visitor messages sit on the left with a plain background.",
            "Your replies sit on the right in the brand color.",
            "Assistant messages are outlined cards, labelled with the assistant's name.",
            "Every message shows who sent it and the time.",
          ],
        },
        {
          kind: "doDont",
          dos: [
            "Open with the visitor's actual question, in their words.",
            "Say what happens next and who will do it.",
            "Keep sentences short — most visitors are on a phone.",
            "Use approved response templates when one fits.",
          ],
          donts: [
            "Do not promise eligibility, approval, coverage or a payment amount.",
            "Do not give clinical or legal advice.",
            "Do not paste internal notes, ticket numbers or system messages into the chat.",
            "Do not leave a claimed conversation without a reply — that is what an abandoned conversation is.",
          ],
        },
      ],
    },
    {
      id: "inbox-attachments",
      title: "Files a visitor sends",
      summary: "Open and save attachments correctly.",
      gate: { anyOf: ["conversation.reply", "conversation.reply_assigned"] },
      blocks: [
        {
          kind: "p",
          text: "Attachments appear inside the transcript as a small card with the file name, type and size, and two buttons.",
        },
        {
          kind: "steps",
          items: [
            "Select View to open the file in a new browser tab.",
            "Select Save to download a copy to your computer.",
            "If the file will not open, return to the transcript and select the button again — access links are generated fresh each time and expire quickly.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Downloads leave the platform",
          text: "A saved file is no longer protected by CareConnect's access rules. Only download when you genuinely need to, and delete local copies when you are done.",
        },
      ],
    },
    {
      id: "inbox-finish",
      title: "Finishing a conversation",
      summary: "Close out with the right status.",
      gate: { anyOf: ["conversation.close"] },
      blocks: [
        {
          kind: "table",
          head: ["Button", "Use it when", "What it means in reporting"],
          rows: [
            ["Resolve", "The visitor's need was met", "Counts as a completed, resolved conversation"],
            ["Close", "The chat is over without a resolution — abandoned, duplicate or out of scope", "Counts as completed but not resolved"],
          ],
        },
        {
          kind: "steps",
          items: [
            "Confirm the visitor has what they need, or that nothing more can be done.",
            "Select Resolve or Close in the header.",
            "The status badge updates and the conversation moves to the Closed tab.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Closing is not deleting",
          text: "Everything stays readable in the Closed tab and in reports. If the visitor writes again, the conversation reopens.",
        },
      ],
    },
    {
      id: "inbox-transfer",
      title: "Sending work to the right team",
      summary: "Transfer to a department, or reassign to a person.",
      gate: { anyOf: ["conversation.transfer", "conversation.reassign", "conversation.assign"] },
      blocks: [
        { kind: "figure", figure: "inbox-transfer" },
        {
          kind: "steps",
          title: "Transfer to another department",
          items: [
            "Open the conversation.",
            "Use the Transfer to… selector in the header and choose the destination department.",
            "The conversation moves to that department's queue and the department's members are notified.",
            "Tell the visitor what you are doing before you transfer — “I'm passing you to our Enrollment team, they'll pick this up here.”",
          ],
        },
        {
          kind: "steps",
          title: "Reassign to a specific person",
          items: [
            "Select Reassign in the header.",
            "Read the candidate list: only teammates in this conversation's department with a chat-handling role are shown, each with presence, current load against capacity and their departments.",
            "Select Assign next to an eligible teammate.",
            "If someone is ineligible, the reason is shown next to them. Where an override is allowed, select Override…, type a reason of at least a few words, and confirm — the reason is recorded.",
            "To hand the conversation back to the queue instead, select “Return to the department queue”.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Do not transfer as a way of ending your shift",
          text: "Transferring an unanswered conversation restarts the clock for the visitor. If your shift is ending, reply first, then hand over with context.",
        },
      ],
    },
    {
      id: "inbox-ownership",
      title: "Ownership, view-only and supervision",
      summary: "Know why you can see a conversation but not reply to it.",
      blocks: [
        {
          kind: "table",
          head: ["What you see", "What it means"],
          rows: [
            ["Assigned to you", "You own it; you can reply, resolve and close"],
            ["Assigned to <name>", "A colleague owns it"],
            ["View only", "You may read this conversation but not act on it"],
            ["“Claim this conversation to reply.”", "It is unassigned — claim it first"],
            ["“<name> is currently handling this conversation.”", "Someone else owns it; ask them, or reassign if your role allows"],
            ["“This conversation is closed.”", "It is finished; reopen happens automatically if the visitor writes again"],
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Supervisors follow the same rule",
          text: "Even a supervisor cannot reply to an unassigned conversation. It must be claimed or assigned to someone first — the console and the server agree on this deliberately.",
        },
      ],
    },
  ],
};

export const intakeChapter: Chapter = {
  id: "intake",
  title: "Referrals & enrollments",
  intro: "Requests captured by the widget, tracked to a decision.",
  gate: { anyOf: ["workflow.view_assigned"] },
  sections: [
    {
      id: "intake-overview",
      title: "What an intake request is",
      summary: "Tell an intake apart from a conversation.",
      blocks: [
        { kind: "figure", figure: "intake" },
        {
          kind: "p",
          text: "A conversation is a chat. An intake request is a piece of work with a lifecycle: a referral, an enrollment, a callback request or a general request. It has a reference such as INT-1042, an owner, a stage, an optional due date and a full activity history.",
        },
        {
          kind: "bullets",
          title: "Request types",
          items: [
            "referral — someone is being referred into a service",
            "enrollment — someone wants to join a program",
            "callback — someone asked to be phoned",
            "general — anything else captured through the widget",
          ],
        },
      ],
    },
    {
      id: "intake-finding",
      title: "Finding the right request",
      summary: "Filter a long list down to the work in front of you.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Type into the search box to match a name, reference, email or phone number.",
            "Select a type chip — All, referral, enrollment, general or callback — to narrow by type. Each chip shows its count.",
            "Select a stage tile (New, In review, Contacted, Eligibility check, Submitted) to show only that stage. Select it again to clear.",
            "Use Prev and Next below the table for long lists.",
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          title: "Filters combine",
          text: "Search, type and stage apply together, and the counts always reflect the whole filtered set — not just the page you are looking at.",
        },
      ],
    },
    {
      id: "intake-working",
      title: "Working a request",
      summary: "Move a request forward and leave a clean trail.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Select the row to open the detail panel: email, phone, county, health plan, interest and language.",
            "Change the Stage selector as the work progresses. Every change is recorded in the activity history with the previous and new stage.",
            "Set Assigned to so it is clear who owns it. Choose Unassigned to hand it back.",
            "Set a Due date when a follow-up is promised — overdue requests appear on dashboards.",
            "Add a note describing what you did or what you are waiting for, then select Save note.",
          ],
        },
        {
          kind: "table",
          caption: "Stage ladder",
          head: ["Stage", "Move here when"],
          rows: [
            ["new", "The request has just arrived"],
            ["in review", "You are assessing it"],
            ["contacted", "You have reached the person"],
            ["eligibility check", "You are verifying qualification"],
            ["submitted", "It has gone onward for a decision"],
            ["approved", "The decision is yes"],
            ["denied", "The decision is no"],
            ["withdrawn", "The person no longer wants to proceed"],
          ],
        },
        {
          kind: "doDont",
          dos: [
            "Write notes a colleague could act on without calling you.",
            "Move the stage the moment reality changes, not at the end of the day.",
            "Set a due date whenever you promise a callback.",
          ],
          donts: [
            "Do not park a request in “new” while working it — the queue then lies to everyone.",
            "Do not record clinical judgements; record what was said and what happens next.",
            "Do not leave a request assigned to someone who has left the team.",
          ],
        },
      ],
    },
    {
      id: "intake-export",
      title: "Exporting requests",
      summary: "Take the filtered list into a spreadsheet.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Set the filters you want to export.",
            "Select Export CSV. The button reads “Preparing…” while the file is built on the server.",
            "The file downloads. A message tells you how many rows were exported, and warns you if the export hit its cap so you can narrow the filters.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "An export is member data",
          text: "Store it only where your organization permits, share it only with people who already have access in CareConnect, and delete it when the task is done.",
        },
      ],
    },
  ],
};

export const contactsChapter: Chapter = {
  id: "contacts",
  title: "Contacts",
  intro: "The person behind the conversations.",
  gate: { anyOf: ["contact.view_related"] },
  sections: [
    {
      id: "contacts-overview",
      title: "What a contact record holds",
      summary: "Know what is stored and where it came from.",
      blocks: [
        { kind: "figure", figure: "contacts" },
        {
          kind: "p",
          text: "Contacts are built from what visitors tell the widget: name, email, phone, county, ZIP, health plan, service interest, language, preferred contact method, visitor type and whether consent was recorded. Fields the visitor never provided are simply not shown.",
        },
        {
          kind: "p",
          text: "Each record also lists the conversations and intake requests linked to that person, so you can see their whole history at a glance.",
        },
      ],
    },
    {
      id: "contacts-search",
      title: "Finding a person",
      summary: "Search and filter the directory.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Type a name, email, phone number, county, health plan or service interest into the search box.",
            "Optionally set the Lead status filter: All statuses, new, working, qualified, converted or closed.",
            "Select a row to open the full record.",
            "Use Prev and Next to move through long lists.",
          ],
        },
      ],
    },
    {
      id: "contacts-update",
      title: "Updating a contact",
      summary: "Keep the record honest.",
      gate: { anyOf: ["contact.edit", "contact.view_department", "contact.view_all"] },
      blocks: [
        {
          kind: "steps",
          items: [
            "Open the record.",
            "Select the lead status that matches reality — new, working, qualified, converted or closed. The change saves immediately and is written to the audit log.",
            "Add Staff notes for internal context and select Save notes.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Staff notes are internal, not secret",
          text: "Visitors never see them, but colleagues, supervisors and auditors can. Write them as if they will be read out in a review — because they can be.",
        },
      ],
    },
  ],
};

export const notificationsChapter: Chapter = {
  id: "notifications",
  title: "Notifications",
  intro: "How CareConnect gets your attention, and how to tune it.",
  sections: [
    {
      id: "notifications-feed",
      title: "Reading your alerts",
      summary: "Clear the alert list efficiently.",
      blocks: [
        { kind: "figure", figure: "notifications" },
        {
          kind: "steps",
          items: [
            "Open Notifications from the sidebar or the bell in the header.",
            "Unread alerts are highlighted. Critical alerts carry a red badge.",
            "Select Open on an alert to jump straight to the conversation or request it refers to.",
            "Select Mark read on an individual alert, or Mark all read to clear the list.",
          ],
        },
        {
          kind: "p",
          text: "At the top, a banner shows how many conversations are waiting for a human right now, with a link to the Inbox. It tracks the same number as the red badge on the Inbox menu item.",
        },
      ],
    },
    {
      id: "notifications-desktop",
      title: "Desktop and device alerts",
      summary: "Hear about escalations when the tab is in the background.",
      blocks: [
        {
          kind: "steps",
          items: [
            "On the Notifications screen, find Desktop & device alerts.",
            "Select Enable notifications and accept your browser's permission prompt.",
            "The card then reads “Enabled”, and new escalations pop up even when CareConnect is not the tab you are looking at.",
          ],
        },
        {
          kind: "bullets",
          title: "If the button will not enable",
          items: [
            "“Blocked by your browser” — you previously declined. Re-enable notifications for this site in your browser settings.",
            "“Open the console in its own browser tab” — you are viewing an embedded preview; open CareConnect in a normal tab.",
            "“This browser does not support desktop notifications” — use a current desktop browser.",
          ],
        },
      ],
    },
    {
      id: "notifications-preferences",
      title: "Choosing what reaches you",
      summary: "Set your alert preferences and response target.",
      blocks: [
        {
          kind: "table",
          caption: "Each alert can be delivered in the console, by email, or both",
          head: ["Alert", "Fires when"],
          rows: [
            ["Live-agent escalations", "A visitor asks for a human"],
            ["New referrals & enrollments", "A new intake request arrives"],
            ["First-response SLA breaches", "A waiting conversation passes your first-response target"],
            ["Low satisfaction ratings", "A visitor leaves a poor rating"],
          ],
        },
        {
          kind: "steps",
          items: [
            "Tick the In app and Email boxes you want for each alert.",
            "Set First-response target (minutes) — the default is 15. Waiting conversations older than this show as SLA breaches on your dashboard.",
            "Select Save preferences.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Email delivery",
          text: "Email alerts activate once a sending domain has been verified for your workspace. Until then, rely on in-app and desktop alerts.",
        },
      ],
    },
  ],
};

export const profileChapter: Chapter = {
  id: "profile",
  title: "My settings",
  intro: "Your profile, availability, appearance and account security.",
  sections: [
    {
      id: "profile-details",
      title: "Your profile",
      summary: "Set what teammates and visitors see.",
      blocks: [
        { kind: "figure", figure: "profile" },
        {
          kind: "steps",
          items: [
            "Open My settings from the sidebar.",
            "Upload a profile photo (PNG or JPG up to 5 MB). Use Replace photo to change it or Remove to delete it.",
            "Fill in Full name, Display name (visitor-facing), Job title, Phone, Languages spoken and Time zone.",
            "Select Save changes.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Visitor visibility is opt-in",
          text: "Your name and photo are only shown to website visitors when you tick “Show my name and photo to website visitors”. Leave it off if you would rather appear as your display name alone.",
        },
        {
          kind: "p",
          text: "Your email is read-only here. Your role, organization, departments and maximum simultaneous chats are managed by an administrator — ask them if any of those are wrong.",
        },
      ],
    },
    {
      id: "profile-availability",
      title: "Availability and appearance",
      summary: "Control routing and how the console looks.",
      blocks: [
        {
          kind: "bullets",
          title: "Availability",
          items: [
            "Available — routing may send you new conversations.",
            "Busy — you are working but not taking new work.",
            "Away — you are temporarily off the floor.",
            "Offline — you are done for the day.",
          ],
        },
        {
          kind: "p",
          text: "You can change availability here or from the dashboard header — it is the same setting.",
        },
        {
          kind: "steps",
          title: "Appearance",
          items: [
            "Choose Match device to follow your computer's light or dark setting.",
            "Choose Light or Dark to fix it.",
            "The choice saves immediately and follows your account to any computer.",
          ],
        },
      ],
    },
    {
      id: "profile-security",
      title: "Security shortcuts",
      summary: "Reach the security controls you own.",
      blocks: [
        {
          kind: "bullets",
          items: [
            "Notification preferences — opens the Notifications screen.",
            "Two-step verification — opens the authenticator setup.",
            "Send password reset email — emails you a reset link for your own account.",
          ],
        },
      ],
    },
  ],
};
