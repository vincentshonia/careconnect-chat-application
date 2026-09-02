/**
 * Content & AI chapters: what the assistant knows, how to test it, what the
 * visitor experiences, and how quality and reporting are read.
 */
import type { Chapter } from "../types";

export const visitorChapter: Chapter = {
  id: "visitor",
  title: "What the visitor sees",
  intro: "You cannot support a conversation well without knowing the other side of it.",
  sections: [
    {
      id: "visitor-widget",
      title: "The chat widget",
      summary: "Describe the visitor's screen accurately when you are helping them.",
      blocks: [
        { kind: "figure", figure: "widget-visitor" },
        {
          kind: "bullets",
          items: [
            "A launcher button sits in the corner of the public website. Selecting it opens the chat panel.",
            "The Home tab greets the visitor with your organization's welcome message and quick-start buttons.",
            "The Chat tab is the conversation itself, headed by the assistant's name — for Pacific Health Group, “PHG CareConnect Assistant”.",
            "A Talk to an agent button lets the visitor ask for a human at any moment.",
            "Extra tabs — for example services or FAQs — appear when an administrator has switched them on for that website.",
            "Visitors can attach a file, and after a chat ends they are invited to leave a star rating.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "The visitor keeps their thread",
          text: "The widget remembers the visitor on that browser, so returning visitors see their earlier messages and you get their history.",
        },
      ],
    },
    {
      id: "visitor-journey",
      title: "From visitor question to your Inbox",
      summary: "Follow the path a message takes.",
      blocks: [
        {
          kind: "steps",
          items: [
            "The visitor opens the widget and asks a question.",
            "The assistant searches your published knowledge articles and answers, staying inside the guardrails set for that website.",
            "If the visitor asks for a person, or the assistant judges a person is needed, the conversation is escalated.",
            "Routing rules decide the department. Members of that department are notified and it appears in the Waiting queue.",
            "A member of staff claims it and replies. The visitor sees the reply in the same window.",
            "When the work is done the conversation is resolved or closed, and the visitor may leave a rating.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Crisis language jumps the queue",
          text: "If the visitor describes an emergency, the assistant shows your organization's emergency message first. Treat any such conversation as your top priority.",
        },
      ],
    },
  ],
};

export const knowledgeChapter: Chapter = {
  id: "knowledge",
  title: "Knowledge base",
  intro: "The articles and FAQs the assistant answers from.",
  gate: { anyOf: ["knowledge.read"] },
  sections: [
    {
      id: "knowledge-reading",
      title: "Reading the knowledge base",
      summary: "Find the approved answer before you write your own.",
      blocks: [
        { kind: "figure", figure: "knowledge" },
        {
          kind: "steps",
          items: [
            "Open Knowledge from the sidebar.",
            "Search by title or content, and filter by status — All, Published or Draft.",
            "Select an article to read it exactly as the assistant sees it.",
            "Use Prev and Next for long lists.",
          ],
        },
        {
          kind: "callout",
          tone: "tip",
          title: "Reuse beats rewriting",
          text: "If an approved article answers the visitor's question, quote it. Consistent answers are what make an assistant trustworthy.",
        },
      ],
    },
    {
      id: "knowledge-writing",
      title: "Writing and publishing an article",
      summary: "Add knowledge the assistant can actually use.",
      gate: { anyOf: ["knowledge.create", "knowledge.edit"] },
      blocks: [
        {
          kind: "steps",
          items: [
            "Select New article.",
            "Give it a plain-language title that matches how visitors ask the question.",
            "Write the body. Short paragraphs, one idea each, no internal jargon.",
            "Set the category and add tags so related questions find it.",
            "Choose the website it applies to, or leave it available to all of your websites.",
            "Save as a draft while you work; publish when it is correct.",
          ],
        },
        {
          kind: "doDont",
          dos: [
            "Answer the question in the first sentence.",
            "State eligibility and requirements as conditions — “if… then…”.",
            "Say what the next step is and who to contact.",
            "Review anything time-sensitive on a schedule.",
          ],
          donts: [
            "Do not publish anything you would not want quoted verbatim to a member.",
            "Do not include staff names, direct numbers or internal system references.",
            "Do not put policy exceptions in an article — they belong in a conversation with a person.",
            "Do not leave contradictory articles published; fix or unpublish the old one.",
          ],
        },
        {
          kind: "callout",
          tone: "warning",
          title: "Publishing changes what visitors are told",
          text: "The assistant only uses published articles, and it uses them immediately. Publish deliberately, and unpublish rather than leaving something wrong in place.",
        },
      ],
    },
    {
      id: "knowledge-faqs",
      title: "Widget FAQs",
      summary: "Curate the short answers shown directly in the widget.",
      gate: { anyOf: ["knowledge.edit"] },
      blocks: [
        {
          kind: "p",
          text: "FAQs are question-and-answer pairs displayed in the widget itself, separate from full articles. They are best for the handful of questions almost every visitor asks.",
        },
        {
          kind: "steps",
          items: [
            "Open the FAQs area of the Knowledge screen.",
            "Add a question in the visitor's words and a two-or-three-sentence answer.",
            "Order them so the most common question is first.",
            "Save. The widget picks the change up for new visitors.",
          ],
        },
      ],
    },
  ],
};

export const aiConsoleChapter: Chapter = {
  id: "ai-console",
  title: "AI console",
  intro: "Test the assistant's answer before a visitor gets it.",
  gate: { anyOf: ["knowledge.edit", "knowledge.publish"] },
  sections: [
    {
      id: "ai-console-test",
      title: "Running a test question",
      summary: "Reproduce and diagnose an answer.",
      blocks: [
        { kind: "figure", figure: "ai-console" },
        {
          kind: "steps",
          items: [
            "Open AI console from the sidebar.",
            "Choose the website you are testing — each website can have different instructions and knowledge.",
            "Type the question exactly as the visitor asked it.",
            "Run it and read the answer together with the knowledge it drew on.",
          ],
        },
        {
          kind: "bullets",
          title: "Reading the result",
          items: [
            "A good answer cites the article you expected — the knowledge base is doing its job.",
            "A vague answer usually means no article covers the question. Write one.",
            "A confident but wrong answer means an article is wrong or out of date. Fix or unpublish it.",
            "A refusal is often correct: guardrails stop the assistant from giving clinical or eligibility promises.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Testing is not visitor-facing",
          text: "Nothing you type here reaches a visitor and it does not create a conversation. Test as much as you like.",
        },
      ],
    },
  ],
};

export const qualityChapter: Chapter = {
  id: "quality",
  title: "Quality & QA",
  intro: "Satisfaction, transcript review and coaching evidence.",
  gate: { anyOf: ["reports.team", "reports.organization", "reports.platform"] },
  sections: [
    {
      id: "quality-overview",
      title: "The quality summary",
      summary: "See how the team is actually performing.",
      blocks: [
        { kind: "figure", figure: "quality" },
        {
          kind: "bullets",
          items: [
            "Average satisfaction and the number of ratings received.",
            "The share of low ratings, which is where coaching starts.",
            "First-response and resolution times against target.",
            "Volume handled per person in your scope.",
          ],
        },
        {
          kind: "p",
          text: "All figures are calculated on the server for the period you select, so they match Reports exactly.",
        },
      ],
    },
    {
      id: "quality-review",
      title: "Reviewing transcripts",
      summary: "Turn a rating into concrete feedback.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Filter to the period and, if available, the rating band you want to review.",
            "Open a conversation to read the full transcript.",
            "Judge it on the things staff control: speed of first response, accuracy, tone, and whether the next step was clear.",
            "Record your finding, then coach the individual privately.",
          ],
        },
        {
          kind: "doDont",
          dos: [
            "Review a sample of good conversations too — that is where you find what to teach.",
            "Separate a bad outcome from bad handling; some answers are simply “no”.",
            "Be specific: quote the sentence you would change and offer a better one.",
          ],
          donts: [
            "Do not discuss an individual's scores in a group channel.",
            "Do not use a single low rating as evidence of a pattern.",
            "Do not edit or delete a transcript — records are immutable and must stay that way.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Review inside the platform",
          text: "Read transcripts in CareConnect. Do not copy them into documents or messaging tools for review.",
        },
      ],
    },
  ],
};

export const reportsChapter: Chapter = {
  id: "reports",
  title: "Reports",
  intro: "The operational record, with filters, drill-downs and exports.",
  gate: { anyOf: ["reports.team", "reports.organization", "reports.platform"] },
  sections: [
    {
      id: "reports-scope",
      title: "What you can report on",
      summary: "Know your reach before you read a number.",
      blocks: [
        { kind: "figure", figure: "reports" },
        {
          kind: "table",
          head: ["Your reach", "What Reports covers"],
          rows: [
            ["Own work", "Your own conversations and outcomes"],
            ["Team", "Your departments, including every member's work"],
            ["Organization", "Every department, website and staff member in the organization"],
            ["Platform", "Across organizations, for platform roles"],
          ],
        },
        {
          kind: "p",
          text: "Reports never show data outside your reach. Two people running the same report at the same time can legitimately see different totals.",
        },
      ],
    },
    {
      id: "reports-filters",
      title: "Filtering and date ranges",
      summary: "Ask the question precisely.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Pick a date preset — today, yesterday, this week, last 7 days, this month, last 30 days, last month, this quarter and so on — or set a custom range.",
            "Narrow by department, website or status as needed.",
            "Read the KPI row: volume, first response, resolution time, SLA compliance, satisfaction and escalation rate.",
            "Select a KPI to drill into the conversations behind it — your filters are carried through.",
          ],
        },
        {
          kind: "callout",
          tone: "note",
          title: "Dates follow the organization's timezone",
          text: "“Today” means today where the organization operates, not in your browser's timezone. This is why a late-evening conversation can land on the next day's report.",
        },
        {
          kind: "callout",
          tone: "tip",
          title: "Share the exact view",
          text: "Filters are written into the page address. Copy the URL and a colleague with the same reach sees precisely what you see.",
        },
      ],
    },
    {
      id: "reports-sections",
      title: "The report sections",
      summary: "Choose the right tab for the question.",
      blocks: [
        {
          kind: "table",
          head: ["Section", "Answers"],
          rows: [
            ["Overview", "How did we do overall this period?"],
            ["Volume", "When does demand arrive — by day and by hour?"],
            ["SLA", "Are we answering inside the first-response target?"],
            ["Staff", "Who handled what, how fast, with what outcome?"],
            ["Tickets / conversations", "Which specific conversations sit behind a number?"],
            ["Intake", "How are referrals and enrollments flowing, and what is overdue?"],
            ["AI", "How much is the assistant handling, how often does it escalate, and was it helpful?"],
          ],
        },
      ],
    },
    {
      id: "reports-export",
      title: "Exporting",
      summary: "Get a shareable file without breaking privacy rules.",
      blocks: [
        {
          kind: "steps",
          items: [
            "Set the filters exactly as you want them.",
            "Select the export action for that section.",
            "Wait while the file is built on the server, then save it.",
            "Check the row count in the confirmation. If the export was capped, narrow the date range and export again.",
          ],
        },
        {
          kind: "callout",
          tone: "privacy",
          title: "Exports carry member data",
          text: "Treat every CSV as protected health information: approved storage only, no personal drives, no external sharing, and delete it when the task is done.",
        },
      ],
    },
  ],
};
