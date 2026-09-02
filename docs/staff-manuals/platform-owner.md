# CareConnect staff manual — Platform Administration

_Operate CareConnect across every organization on the platform._

**Who this is for:** Platform owners, platform administrators and support staff.

**Reading time:** About 60 minutes

**Guide version 1.1.0 · Last reviewed 2 September 2026 · App build 2927660**

Illustrations in this manual are drawings of the console, not photographs of it, and every name or number in them is invented.

## Contents

1. Start here
2. Getting into CareConnect
3. Finding your way around
4. Using Help & Training
5. Your dashboard
6. Organizations & brands
7. Websites & the chat widget
8. Departments & hours
9. Routing & templates
10. Staff administration
11. Organization settings
12. Security
13. Audit log
14. Reports
15. Knowledge base
16. Privacy, safety and the audit trail
17. When something looks wrong
18. Words CareConnect uses
19. Common mistakes and your final checklist
20. Knowledge check

---

## 1. Start here

What your role is responsible for, and what to do on day one.

### 1.1 Your role in CareConnect

_Know exactly what you own — and what you do not._

**You operate the platform itself: onboarding organizations, supporting their administrators and keeping every tenant correctly configured — without treating tenant data as browsable.**

**You are responsible for**

- Onboarding new organizations, brands and websites
- Making sure each tenant has working administrators and routing
- Cross-organization reporting
- Supporting tenant administrators with configuration problems

**You are not responsible for**

- Casual access to tenant conversations or member records
- Changing a tenant's operational decisions without their administrator
- Editing the audit trail of any tenant

> **Tip — How to use this guide**
>
> Read Start here and Getting into CareConnect before your first shift. Keep the rest open beside you and work through a chapter whenever you meet that screen for real.

### 1.2 Day one and week one

_Finish onboarding without needing to be chased._

**Before your first shift**

- [ ] Confirm your platform role and what it grants
- [ ] Review the list of organizations and their administrators
- [ ] Read the tenant isolation rules in this guide

**By the end of your first week**

- [ ] Complete a per-tenant health check for every organization
- [ ] Onboard or rehearse onboarding one organization end to end
- [ ] Confirm support access procedures and justification requirements

---

## 2. Getting into CareConnect

Everything between your invitation email and your first look at the console.

### 2.1 How staff accounts are created

_Understand where your account comes from and why there is no public sign-up._

**CareConnect has no public sign-up. Only an administrator in your organization can create staff access, which is why nobody outside your team can reach the console.**

**There are exactly two ways you get an account**

- Direct creation — an administrator creates the account and gives you a work email and a one-time temporary password.
- Invitation link — an administrator sends you a single-use link that expires in 7 days and only works for the email address it was issued to.

> **Note — Your access comes from your membership**
>
> Signing in is not the same as belonging to an organization. If you sign in with an account that has no active membership, CareConnect shows a “no access” page instead of the console. Ask your administrator to add you.

### 2.2 Signing in for the first time

_Get from the sign-in screen into the console._

> **Interface illustration — The CareConnect sign-in screen**
>
> Sign-in card with a Continue with Google button, email and password fields, a Sign in button and a Forgot your password link.
>
> 1. Continue with Google — the fastest route if your work account is a Google account.
> 2. Work email and password — the details an administrator gave you.
> 3. Sign in — submits the form.
> 4. Forgot your password? — emails you a reset link.

**If you were given an invitation link**

1. Open the invitation link from your email. It looks like /invite?t=… and only works once.
2. Sign in with the email address the invitation was sent to. Use Continue with Google if that address is a Google account, otherwise use the email and password fields.
3. The invitation is accepted automatically and you land in the console.

**If you were given a temporary password**

1. Go to the console address your administrator gave you and stay on the /auth screen.
2. Enter your work email and the temporary password exactly as provided.
3. Select Sign in.
4. Change the password straight away: open My settings, then Send password reset email, and follow the link.

> **Warning — Temporary passwords are shown once**
>
> Your administrator cannot see the temporary password again after it is created. If you lose it before your first sign-in, use Forgot your password? on the sign-in screen or ask for a new invitation.

### 2.3 Two-step verification

_Set up an authenticator app and know what to expect when your organization requires it._

Two-step verification adds a 6-digit code from an authenticator app on top of your password. Your organization can leave it optional, require it for administrators, or require it for everyone. When it is required for you, CareConnect sends you to the verification screen before the console loads.

**Turn it on**

1. Open the /mfa screen — either by following the prompt after sign-in, or from My settings, then Two-step verification.
2. Choose to add an authenticator app. CareConnect shows a QR code.
3. Scan the code with Google Authenticator, 1Password, Authy or a similar app. If you cannot scan, type the setup key shown under the code.
4. Enter the 6-digit code your app displays and confirm.

**Every sign-in after that**

1. Sign in with your email and password (or Google).
2. Open your authenticator app and read the current 6-digit code.
3. Enter the code. Codes change roughly every 30 seconds — if it is about to expire, wait for the next one.

> **Warning — Lost your phone?**
>
> Nobody can read your codes for you. Contact an administrator: they can remove the enrolled factor from your account so you can enrol a new device.

### 2.4 Resetting your password

_Recover access without waiting for an administrator._

1. On the sign-in screen, select Forgot your password?
2. Enter your work email address and submit.
3. Open the email and follow the reset link — it opens the reset-password screen.
4. Enter a new password twice and save. You are signed in automatically.

> **Note — Already signed in?**
>
> You can send yourself the same reset email from My settings, under Notifications & security.

### 2.5 Signing out and shared computers

_Leave a workstation safely._

1. Select Sign out at the bottom of the left sidebar.
2. On a shared or public computer, also close the browser window.
3. If you suspect someone else used your account, open Security (when your role includes it) and use Sign out other devices, then tell an administrator.

> **Privacy — Why this matters**
>
> Conversations can contain protected health information. An unattended, signed-in console is a privacy incident waiting to happen.

---

## 3. Finding your way around

The console layout is the same on every screen. Learn it once.

### 3.1 The layout

_Name every part of the screen you are looking at._

> **Interface illustration — The console at a glance**
>
> Console layout showing the branded sidebar with grouped navigation, a page header with title and description, an alert bell and the main content area.
>
> 1. Your organization's logo or name. Selecting it returns you to the console home.
> 2. Navigation groups: Workspace, Content & AI, and Configuration. You only see items your role allows.
> 3. Red count badges: Inbox shows conversations waiting for a response, Notifications shows your unread alerts.
> 4. Page title and one-line description of the screen you are on.
> 5. Alert bell — opens Notifications from anywhere.
> 6. Bottom of the sidebar: theme switch, Collapse, and Sign out.

- Left sidebar — your organization's logo or name at the top, navigation in the middle, and theme, Collapse and Sign out at the bottom.
- Page header — the screen's title and a one-line description of what it does, plus the alert bell.
- Main area — the screen itself.

**Try it now**

1. Select Collapse at the bottom of the sidebar. The sidebar shrinks to icons; hover an icon to see its name.
2. Select it again to expand.
3. Select the theme item (Dark mode / Light mode) to switch appearance. Your choice is remembered on your account.

> **Tip — On a phone or tablet**
>
> The sidebar is hidden. Use the menu button at the top-left of the header to open navigation, and it closes again as soon as you pick a screen.

### 3.2 What each menu item does

_Know where to go before you start clicking._

Navigation is grouped into Workspace (day-to-day work), Content & AI (what the assistant knows and how well the team performs) and Configuration (how the platform behaves). You only see items your role allows — the list below marks who sees what.

*Every navigation item in CareConnect*

| Menu item | What it is for | Who sees it |
| --- | --- | --- |
| Dashboard | Your live workload, what needs attention, and your numbers | Everyone |
| Inbox | Website chat conversations: claim, reply, resolve, close | Everyone with chat access |
| Intake | Referral and enrollment requests from first contact to a decision | Everyone with chat access |
| Contacts | The directory of visitors, leads and referral contacts | Everyone with chat access |
| Notifications | Your alerts and how you want to receive them | Everyone |
| My settings | Your profile, availability, appearance and security | Everyone |
| Knowledge | Articles that power the assistant, and widget FAQs | Everyone (editing needs Manager and above) |
| AI console | Test the assistant's answer to a question before visitors see it | Manager and above |
| Quality & QA | Satisfaction scores, transcript review and agent scorecards | Team Lead and above |
| Reports | Operational reporting and CSV exports | Team Lead and above |
| Websites | Widget branding, copy, tabs and the embed snippet | Administrator and above |
| Departments | Departments, business hours and holiday closures | Administrator and above |
| Routing | Rules that send escalations to a department, plus reply templates | Administrator and above |
| Staff | Add teammates, set roles, departments and capacity | Team Lead can view; Administrator can change |
| Organizations | Tenants, brands and their websites | Super Admin and platform administrators |
| Organization settings | Contact details, chatbot guardrails, compliance notices | Administrator and above |
| Security | Organization MFA policy and your authenticator | Super Admin and platform administrators |
| Audit log | Append-only history of who changed what | Administrator and above |
| Help & Training | This training center: guides, checklists and knowledge checks | Everyone |

> **Note — Missing an item you were told about?**
>
> Nothing is broken: your role does not include it. Menu items, page guards and the database all enforce the same rules. Ask an administrator if you need access.

### 3.3 Badges, counts and alerts

_Tell the two red numbers apart._

| Where | What the number means |
| --- | --- |
| Red badge on Inbox | Conversations waiting for a response right now, in the queues you can see |
| Red badge on Notifications | Your unread alerts |
| Red dot on the bell in the header | The same unread alert count, available from any screen |

Both update live — you do not need to refresh the page. A number that stays high usually means work is genuinely waiting, not that the badge is stuck.

---

## 4. Using Help & Training

How this training center works, and where to go when the guide does not answer your question.

### 4.1 How to use this guide

_Find, read, tick off and print the parts you need._

**Help & Training is always in the Workspace group of the left sidebar. It opens on the guide for your own role, and everything you see here matches what your account can actually do.**

**The controls at the top of the page**

1. Guide selector — if your role supervises other roles you can also read their guides. Standard Users see only their own.
2. Start here / Continue — jumps to the first section you have not finished.
3. Print or save as PDF — opens your browser's print dialog with the whole guide expanded. Choose “Save as PDF” as the destination to keep a copy.
4. Restart guide — clears your ticks for the guide you are reading. It never affects anyone else.

**Reading and tracking**

1. Use the Search this guide box to filter both the contents list and the page. Try a word you saw on screen, such as claim, transfer, holiday or password.
2. Select any entry in Contents to jump to that section.
3. Select Mark complete when you have actually done the thing the section describes — not just read it.
4. Use Collapse all to skim the headings, then Expand all when you want the detail back.
5. Previous and Next at the bottom of each section move you through the guide in order.

> **Note — Your progress is saved on this device**
>
> Ticks are stored in this browser against your own account, so a shared workstation never mixes two people's progress. Sign in on a different computer and you will start with an empty checklist there.

> **Tip — Illustrations, not screenshots**
>
> Every picture in this guide is a drawn diagram of the console using the real labels and colours, with numbered markers explained underneath. They contain invented names and numbers on purpose, so no real member or colleague data is ever shown in training material.

### 4.2 Need help beyond this guide?

_Get an answer quickly, without putting member data at risk._

**In this order**

1. Search this guide — most questions are answered in the chapter for the screen you are on.
2. Check the “When something looks wrong” chapter for the common problems and their fixes.
3. Ask your team lead for anything about the day's work: queues, transfers, priorities.
4. Ask an administrator for anything about access, roles, departments, routing, hours or settings.
5. Report anything that looks like a privacy or security problem to an administrator immediately, and follow your internal policy.

> **Privacy — Never paste member details into a help request**
>
> Use the reference number instead — for example PHG-2041 or INT-1042 — and describe what you expected and what happened. Names, dates of birth, member numbers and health details stay inside CareConnect.

> **Note — Something in this guide looks out of date?**
>
> Tell an administrator. Administrators and Super Admins can flag the guide for review from the top of this page, which leaves a visible note for the rest of the organization until the material is corrected.

---

## 5. Your dashboard

The first screen after sign-in, showing the whole organization's live position.

### 5.1 What the dashboard is for

_Read the screen in the order it is designed to be read._

> **Interface illustration — Dashboard — Administrator and Super Admin view**
>
> Organization-scoped dashboard showing organization-wide live counters, department performance, agent workload and the organization overview panel.
>
> 1. Right now — organization-wide live counters: Open, Waiting, Unassigned, Active, Agent requested, Completed today, SLA risk, Open intakes.
> 2. Every counter is a link: selecting one opens the Inbox or Intake already filtered to those records.
> 3. Department performance — all departments in the tenant, not just yours.
> 4. Organization overview and AI vs human assistance — historical totals for the selected period.

The dashboard answers three questions in order: what is happening right now, what needs me next, and how am I (or my team) doing. Work top to bottom and you will not miss anything urgent.

**Start of shift, every day**

1. Set your availability in the header — Available, Busy, Away or Offline. Routing only sends new work to people who are available and under capacity.
2. Read Right now for the live position.
3. Work through Needs my attention from the top; it is already ordered by urgency.
4. Check Available conversations for waiting visitors you can claim.

> **Tip — Availability is not cosmetic**
>
> Leaving yourself Available while you are away holds work in a queue nobody is watching. Set Away when you step out, and Offline at the end of your shift.

### 5.2 Right now

_Interpret every live counter correctly._

*Organization-wide live counters*

| Counter | What it counts |
| --- | --- |
| Open | Every conversation not yet resolved or closed |
| Waiting | Conversations needing a person that nobody owns |
| Unassigned | Open conversations with no owner |
| Active | Conversations in live back-and-forth |
| Agent requested | Visitors who explicitly asked for a human |
| Completed today | Resolved or closed today, in your organization's timezone |
| SLA risk | Conversations at risk of missing the first-response target |
| Open intakes | Referral and enrollment requests still open |

Every counter is a link. Selecting Waiting opens the Inbox already filtered to the waiting queue; selecting Open intakes opens Intake. Use them as shortcuts rather than filtering by hand.

### 5.3 Needs my attention

_Clear the urgent list without guesswork._

This panel lists work in urgency order: visitors waiting, conversations at SLA risk, escalations, then follow-ups. Each row shows the visitor or contact name, the subject, why it is listed, how long it has been waiting and the department.

1. Select a row to open that conversation in the Inbox.
2. Deal with it — claim it, reply, or resolve it.
3. Return to the dashboard; the row disappears once the reason no longer applies.

> **Note — An empty panel is a good sign**
>
> Nothing urgent is outstanding in your scope. Use the time for follow-ups and intake work.

### 5.4 My performance

_Understand your own numbers before anyone else discusses them._

Choose a period — Today, This week, Last 7 days, This month or Last 30 days — and the panel recalculates. Arrows compare the current period with the one before it.

| Metric | What it means |
| --- | --- |
| Conversations claimed | How many you took ownership of |
| Conversations handled | How many you actually worked |
| Resolved / Closed | Finished with the need met / finished without a resolution |
| Completion rate | Completed conversations divided by conversations you handled |
| Avg. first response | How long visitors waited for your first reply |
| Median first response | Your typical reply speed, shown once you have enough volume |
| Avg. time to claim | How quickly you pick work up |
| Avg. handle time | From claim to resolution or closure |
| SLA compliance | Share of eligible conversations answered inside the target |
| Visitor satisfaction | Your average star rating, once visitors have rated you |
| Department average response | A privacy-safe benchmark — the department average, never an individual colleague |

> **Privacy — You cannot see a colleague's individual numbers here**
>
> Comparisons are against the department average by design. Individual performance is only visible to roles responsible for coaching.

### 5.5 Available conversations

_Pick up waiting work safely._

This panel lists waiting visitors you are eligible to claim, with how long they have been waiting, the department, and an “Agent requested” badge when the visitor asked for a person by name.

1. Read the oldest waiting item first.
2. Select Claim on that row.
3. You are now the owner; open it in the Inbox and reply.

> **Warning — Claiming can fail — and that is fine**
>
> If a colleague claimed it a second earlier, or you are at capacity, the claim is refused. Nothing is lost; move to the next item.

When the panel says “The queue is clear.”, nobody is waiting.

### 5.6 Department and staff panels

_Use the team view to spot trouble before it becomes a complaint._

- Staff availability — live counts of who is Available, Busy, Away, Offline and who is at capacity.
- Department performance — every department: open, waiting, active, completed today, oldest waiting, SLA risk, average response, SLA % , CSAT and available staff.
- Agent workload — presence, active against capacity, waiting replies, completed today, average response and SLA % for staff in your scope.
- Requests — referral and enrollment workload, including anything overdue.

**The 60-second team check**

1. Look at Waiting and Oldest waiting per department — anything growing needs a person now.
2. Compare available staff against waiting work; if nobody is available, reassign or step in yourself.
3. Scan for teammates at capacity and rebalance before the queue backs up.
4. Select any row to open the full report for that department or person.

### 5.7 Organization overview and AI vs human assistance

_Read the tenant-level trend without opening Reports._

- Organization overview — totals for the selected period: conversations, human assistance requests, claimed, completed, resolved, closed without resolution, reopened, transfer rate, average first response, average resolution, SLA compliance, satisfaction and escalations.
- AI vs human assistance — how much the assistant deflects: AI handled, human assisted and the escalation rate.

> **Note — Dashboard is live; Reports is the record**
>
> Use the dashboard to run the day. Use Reports when you need filters, drill-downs or an export to share.

---

## 6. Organizations & brands

Managing multiple tenants on one platform.

### 6.1 Organizations, brands and websites

_Keep tenants genuinely separate._

> **Interface illustration — Organizations & brands**
>
> Organizations screen with a tenant list, tenant detail form, and cards for brands and websites.
>
> 1. Tenant list — every organization you may administer.
> 2. Tenant details: name, support email, phone, timezone, primary color and address.
> 3. Organization-wide AI instructions, emergency message and privacy notice.
> 4. Brands and Websites belonging to this tenant.

An organization is a tenant. Under it sit brands and websites. Conversations, knowledge, contacts, staff and settings never cross a tenant boundary — the database enforces this, not just the interface.

**Onboarding a new organization**

1. Create the organization and set its timezone and contact details.
2. Create its first website and apply the brand's colors, logo and assistant name.
3. Create the departments that will receive work, with hours and members.
4. Add routing rules, including a catch-all.
5. Load and publish the starting knowledge articles and widget FAQs.
6. Create the first administrator for that organization and hand over.

> **Privacy — Cross-tenant access is exceptional**
>
> Platform access exists for support, not for browsing. Enter a tenant only for a specific, justified task — every action is attributed to you in that tenant's audit log.

### 6.2 Platform health checks

_Keep every tenant configured correctly._

**Per-tenant review**

- [ ] At least two administrators, so nobody is locked out
- [ ] Timezone and first-response target set
- [ ] Every website has a catch-all routing rule to a staffed department
- [ ] Departments have current hours, holidays and members
- [ ] Knowledge is published and free of contradictions
- [ ] Two-step verification policy matches the tenant's requirements

---

## 7. Websites & the chat widget

Branding, copy, tabs and the code that puts the widget on a public site.

### 7.1 Websites in your organization

_Understand what a website record controls._

> **Interface illustration — Websites & widget settings**
>
> Website settings with a site list, grouped settings cards for basics, home screen, chat copy and bottom navigation, the embed snippet and a live widget preview.
>
> 1. Website list, plus + Add website.
> 2. Site basics: names, domains, allowed embed domains, colors, position and trigger delay.
> 3. Home screen and Chat & messaging: the exact words visitors read.
> 4. Bottom navigation buttons: rename, reorder, re-icon or hide tabs. Chat always stays visible.
> 5. Live preview updates as you type — nothing is saved until you select Save settings.
> 6. Embed snippet to paste before the closing body tag, plus Suspend and Delete controls.

Each website record represents one public site running the widget. It owns that site's branding, welcome copy, tabs, assistant instructions and embed snippet — so two brands can behave completely differently.

1. Open Websites from the sidebar.
2. Select a website to edit it, or create a new one for a new brand or domain.
3. Work through the setting groups: Basics, Home, Chat and Navigation.
4. Watch the live preview beside the settings — it renders exactly what a visitor will see.

### 7.2 The setting groups

_Change the right setting the first time._

| Group | Controls |
| --- | --- |
| Basics | Website name, domain, brand colors, logo and the assistant's display name |
| Home | The greeting shown when the widget opens, plus quick-start buttons |
| Chat | Chat header text, the “Talk to an agent” option, attachments and the satisfaction prompt |
| Navigation | Which tabs the widget shows and what each one contains |

**Choosing colors**

1. Use the color picker to set the brand color, or type an exact hex value.
2. Check the preview in both light and dark surroundings.
3. Keep text and background contrast high enough to read on a phone in daylight.

> **Warning — Changes are public immediately**
>
> Saving updates the live widget on that website. Preview first, then save, then load the public page to confirm.

### 7.3 Installing the widget

_Hand a working snippet to whoever runs the website._

1. Open the website record and copy the embed snippet.
2. Send it to the person who maintains the site, asking them to paste it before the closing </body> tag on every page.
3. Load the public site and confirm the launcher appears.
4. Send a test message and confirm it arrives in the Inbox.

**Go-live checklist for a new website**

- [ ] Branding, logo and assistant name match the brand
- [ ] Welcome message and quick-start buttons reviewed
- [ ] Published knowledge articles cover that brand's common questions
- [ ] A routing rule sends escalations to a real department
- [ ] That department has business hours and members
- [ ] A test conversation was escalated, claimed, answered and resolved

---

## 8. Departments & hours

The teams that receive work, and when they are open.

### 8.1 Creating and editing departments

_Set up a team that can actually receive conversations._

> **Interface illustration — Departments & hours**
>
> Departments screen with tabs for Departments, Business hours and Holidays, a department list with routing and status controls, and the add-department form.
>
> 1. Tabs: Departments, Business hours, Holidays.
> 2. New department — name it after the work, not the person.
> 3. Each row shows routing method, member count and timezone.
> 4. Controls: Make default, switch routing method, Deactivate and Delete.
> 5. Business hours per weekday, and holiday closures.

1. Open Departments from the sidebar.
2. Create a department with a name staff will recognise on a transfer menu.
3. Set its business hours per weekday, in the organization's timezone.
4. Add holiday closures for dates the team is unavailable.
5. Add members — a department with no members cannot be routed to sensibly.

> **Warning — Hours change visitor expectations**
>
> Outside business hours the widget sets a different expectation for a reply. Keep hours truthful rather than optimistic.

### 8.2 Keeping departments healthy

_Prevent the queue nobody watches._

**Monthly review**

- [ ] Every department still has an owner and enough members
- [ ] Members' capacity settings reflect real workload
- [ ] Holiday closures for the next quarter are entered
- [ ] No department is receiving work it never resolves
- [ ] Departments that no longer exist have been retired and their routing rules updated

---

## 9. Routing & templates

Where escalations go, and the approved wording staff reuse.

### 9.1 Routing rules

_Send each escalation to the team that can resolve it._

> **Interface illustration — Routing & templates**
>
> Routing screen with rule creation fields, a list of rules with enable and delete controls, and the response templates tab.
>
> 1. Tabs: Routing rules and Response templates.
> 2. Rule fields: name, what to match on, the value to match and the destination department.
> 3. Rule list shows the match, the destination and the priority.
> 4. Disable keeps a rule for later; Delete removes it immediately.
> 5. Templates: name, shortcut, category and message, with Approve for the ones agents may send.

1. Open Routing from the sidebar.
2. Create a rule that matches on the website and the conversation's topic or intent.
3. Choose the destination department.
4. Set the order — rules are evaluated in order, and the first match wins.
5. Save, then send a test message through the widget to confirm it lands in the right queue.

**How assignment then works**

- Members of the destination department are notified that work is waiting.
- Round-robin assignment offers work fairly to available staff who are under capacity.
- Anyone eligible can claim from the queue; the first successful claim wins.
- If nobody is available, the conversation waits in the queue and appears as SLA risk on dashboards.

> **Warning — Always keep a catch-all**
>
> Make sure a final, broad rule sends anything unmatched to a staffed department. Without it a conversation can sit unclaimed.

### 9.2 Response templates

_Give staff approved wording for repeated situations._

1. Open the templates area of the Routing screen.
2. Create a template with a name staff will search for, and body text they can send with minimal edits.
3. Keep the wording compliant — no eligibility promises, no clinical advice.
4. Review templates whenever a program or policy changes.

---

## 10. Staff administration

Accounts, roles, departments and capacity.

### 10.1 The staff directory

_Read the roster at a glance._

> **Interface illustration — Staff & roles**
>
> Staff screen with search and filters, the add-staff form, invitation card and a teammate row showing role, presence, capacity, departments and account access controls.
>
> 1. Search and filters: role, department and account status (Active, Disabled, Removed, All accounts).
> 2. Add a staff member — creates the account immediately and shows a one-time temporary password.
> 3. Invite a teammate — a single-use link that expires in 7 days.
> 4. Per-teammate controls: role, presence and maximum simultaneous chats.
> 5. Departments — select a name to add or remove that person; this is what drives routing.
> 6. Account access: Disable, Re-enable and Remove. History is always kept.

The directory lists everyone in the organization with their role, departments, presence, capacity and status. Search by name or email, filter by role or status, and page through with Prev and Next.

### 10.2 Adding a teammate

_Create access safely._

**Create the account directly**

1. Select Add staff.
2. Enter their work email and full name.
3. Choose the role — grant the lowest role that lets them do the job.
4. Assign departments and set maximum simultaneous chats.
5. Create the account. A temporary password is shown once — copy it and deliver it through a channel your organization approves.
6. Tell them to change it immediately after signing in.

**Or send an invitation**

1. Select the invitation option and enter the email and role.
2. Send the link. It is single-use, tied to that email, and expires after 7 days.
3. If it expires, issue a new one — old links stop working.

> **Privacy — Never share a temporary password insecurely**
>
> Do not send it by SMS, personal email or a public channel. If in doubt, use an invitation link instead.

### 10.3 Roles, departments and capacity

_Change access as people change jobs._

1. Open the person's record from the directory.
2. Change their role, departments or maximum simultaneous chats.
3. Save. The change takes effect on their next page load and is written to the audit log.

**Rules the system enforces**

- Roles are cumulative — each level includes everything below it.
- You cannot grant a role above your own.
- Only the highest level of administration may create or change other administrators.
- You cannot remove the last administrator of an organization.
- Nobody can raise their own role, even by editing their own profile.

### 10.4 Disabling and removing access

_Close access the moment someone leaves._

1. Reassign their open conversations and intake requests first — disabling does not hand work over.
2. Open their record and disable the account. They can no longer sign in; their history is retained.
3. Remove the membership only when the separation is permanent and your retention policy allows it.

**Offboarding checklist**

- [ ] Open conversations reassigned
- [ ] Open intake requests reassigned
- [ ] Account disabled the same day access ends
- [ ] Departments and routing updated if they were the only member
- [ ] Change confirmed in the audit log

---

## 11. Organization settings

Contact details, timezone, assistant guardrails and compliance notices.

### 11.1 Organization profile and timezone

_Set the values everything else depends on._

> **Interface illustration — Organization settings**
>
> Settings screen with brand logo upload, organization contact fields, chatbot instructions, emergency message and privacy notice.
>
> 1. Brand logo — PNG, JPG or SVG up to 2 MB. It replaces the organization name in the sidebar.
> 2. Organization name, timezone, phone, email and address. Timezone drives every “today” number.
> 3. Chatbot instructions — tone and rules layered on top of the built-in safety guardrails.
> 4. Emergency / crisis message and Privacy notice shown to visitors.
> 5. Save settings — nothing takes effect until you select it.

- Organization name and public contact details used in visitor-facing copy.
- Timezone — every report, “today” and business-hours calculation uses it.
- Default first-response target, which drives SLA figures across the platform.

> **Warning — Changing the timezone moves the numbers**
>
> Reports recalculate against the new timezone, so historical daily totals can shift. Change it once, deliberately, and tell the team.

### 11.2 Assistant guardrails and compliance notices

_Control what the assistant is allowed to say._

- Assistant instructions — the tone and boundaries applied to every answer.
- Emergency message — shown immediately when crisis language is detected.
- Compliance notices — the disclaimers displayed to visitors.

**Do**

- State clearly that the assistant cannot give clinical advice or confirm eligibility.
- Keep the emergency message short, direct and actionable.
- Review the wording with whoever owns compliance before saving.

**Don't**

- Do not weaken guardrails to make the assistant more helpful.
- Do not put program specifics here — those belong in knowledge articles.

---

## 12. Security

Authentication policy and your own authenticator.

### 12.1 Two-step verification policy

_Decide who must use an authenticator._

> **Interface illustration — Security**
>
> Security screen with the organization MFA policy card, personal authenticator enrollment and account hygiene guidance.
>
> 1. Organization MFA policy: require two-step verification for everyone, for administrators only, or leave it optional.
> 2. Your own authenticator app: Add authenticator app, scan the QR code, then confirm the 6-digit code.
> 3. Account hygiene reminders.
> 4. Sign out other devices ends every other session on your account.

1. Open Security from the sidebar.
2. Choose the policy: optional, required for administrators, or required for everyone.
3. Save. Affected staff are asked to enrol the next time they sign in.
4. Manage your own enrolled authenticator from the same screen.

> **Warning — Announce before you enforce**
>
> Requiring verification for everyone blocks sign-in until each person enrols. Tell the team a day ahead and make sure someone can help with lockouts.

---

## 13. Audit log

The append-only record of who changed what.

### 13.1 Reading the log

_Answer “who did this, and when?”._

> **Interface illustration — Audit log**
>
> Audit log with search, CSV export and a table of timestamped actions with actor, action and affected record.
>
> 1. Search across action, record and person.
> 2. Export CSV of the entries matching your search.
> 3. Columns: When, Actor, Action, Record. Entries can never be edited or deleted.

1. Open Audit log from the sidebar.
2. Filter by action, actor or date range.
3. Read the entry: who acted, what changed, and the values before and after.
4. Page through results with Prev and Next.

**What is recorded**

- Sign-ins and security changes
- Staff creation, role changes, disabling and removal
- Conversation claims, transfers, reassignments and closures
- Contact and intake record changes
- Website, department, routing and organization setting changes

> **Note — Nothing here can be edited**
>
> The log is append-only for everyone, including administrators. That is what makes it usable as evidence.

---

## 14. Reports

The operational record, with filters, drill-downs and exports.

### 14.1 What you can report on

_Know your reach before you read a number._

> **Interface illustration — Reporting & analytics**
>
> Reports screen with a scope badge, filter bar, report tabs, KPI cards that drill into the ticket explorer, and an export button.
>
> 1. Scope badge — the data you are allowed to see: self, team, organization or platform.
> 2. Filter bar: date range preset, department, staff, website, conversation type, transfers, status, priority and SLA target.
> 3. Tabs: Overview, Departments, Staff, Tickets, Transfers, Response & SLA, AI assistant, Requests. You only see the tabs your scope allows.
> 4. KPI cards. Selecting one opens the Tickets tab filtered to exactly those conversations.
> 5. Export CSV downloads the current view with all filters applied.

| Your reach | What Reports covers |
| --- | --- |
| Own work | Your own conversations and outcomes |
| Team | Your departments, including every member's work |
| Organization | Every department, website and staff member in the organization |
| Platform | Across organizations, for platform roles |

Reports never show data outside your reach. Two people running the same report at the same time can legitimately see different totals.

### 14.2 Filtering and date ranges

_Ask the question precisely._

1. Pick a date preset — today, yesterday, this week, last 7 days, this month, last 30 days, last month, this quarter and so on — or set a custom range.
2. Narrow by department, website or status as needed.
3. Read the KPI row: volume, first response, resolution time, SLA compliance, satisfaction and escalation rate.
4. Select a KPI to drill into the conversations behind it — your filters are carried through.

> **Note — Dates follow the organization's timezone**
>
> “Today” means today where the organization operates, not in your browser's timezone. This is why a late-evening conversation can land on the next day's report.

> **Tip — Share the exact view**
>
> Filters are written into the page address. Copy the URL and a colleague with the same reach sees precisely what you see.

### 14.3 The report sections

_Choose the right tab for the question._

| Section | Answers |
| --- | --- |
| Overview | How did we do overall this period? |
| Volume | When does demand arrive — by day and by hour? |
| SLA | Are we answering inside the first-response target? |
| Staff | Who handled what, how fast, with what outcome? |
| Tickets / conversations | Which specific conversations sit behind a number? |
| Intake | How are referrals and enrollments flowing, and what is overdue? |
| AI | How much is the assistant handling, how often does it escalate, and was it helpful? |

### 14.4 Exporting

_Get a shareable file without breaking privacy rules._

1. Set the filters exactly as you want them.
2. Select the export action for that section.
3. Wait while the file is built on the server, then save it.
4. Check the row count in the confirmation. If the export was capped, narrow the date range and export again.

> **Privacy — Exports carry member data**
>
> Treat every CSV as protected health information: approved storage only, no personal drives, no external sharing, and delete it when the task is done.

---

## 15. Knowledge base

The articles and FAQs the assistant answers from.

### 15.1 Reading the knowledge base

_Find the approved answer before you write your own._

> **Interface illustration — Knowledge base**
>
> Knowledge screen with Articles and FAQs tabs, an article list with statuses and an editor with title, summary, status, content and Save and re-index.
>
> 1. Tabs: Articles power the AI assistant's answers, FAQs appear in the widget.
> 2. New article creates a draft called “Untitled article”.
> 3. Article list with the current status badge and last update.
> 4. Editor fields: Title, Summary, Status, Content.
> 5. Save & re-index rewrites the AI's search index for that article. Delete removes the article and its indexed chunks.

1. Open Knowledge from the sidebar.
2. Search by title or content, and filter by status — All, Published or Draft.
3. Select an article to read it exactly as the assistant sees it.
4. Use Prev and Next for long lists.

> **Tip — Reuse beats rewriting**
>
> If an approved article answers the visitor's question, quote it. Consistent answers are what make an assistant trustworthy.

### 15.2 Writing and publishing an article

_Add knowledge the assistant can actually use._

1. Select New article.
2. Give it a plain-language title that matches how visitors ask the question.
3. Write the body. Short paragraphs, one idea each, no internal jargon.
4. Set the category and add tags so related questions find it.
5. Choose the website it applies to, or leave it available to all of your websites.
6. Save as a draft while you work; publish when it is correct.

**Do**

- Answer the question in the first sentence.
- State eligibility and requirements as conditions — “if… then…”.
- Say what the next step is and who to contact.
- Review anything time-sensitive on a schedule.

**Don't**

- Do not publish anything you would not want quoted verbatim to a member.
- Do not include staff names, direct numbers or internal system references.
- Do not put policy exceptions in an article — they belong in a conversation with a person.
- Do not leave contradictory articles published; fix or unpublish the old one.

> **Warning — Publishing changes what visitors are told**
>
> The assistant only uses published articles, and it uses them immediately. Publish deliberately, and unpublish rather than leaving something wrong in place.

### 15.3 Widget FAQs

_Curate the short answers shown directly in the widget._

FAQs are question-and-answer pairs displayed in the widget itself, separate from full articles. They are best for the handful of questions almost every visitor asks.

1. Open the FAQs area of the Knowledge screen.
2. Add a question in the visitor's words and a two-or-three-sentence answer.
3. Order them so the most common question is first.
4. Save. The widget picks the change up for new visitors.

---

## 16. Privacy, safety and the audit trail

The rules that apply to every role, every day.

### 16.1 Handling protected health information

_Know what you may write, where, and to whom._

**Visitors tell CareConnect real things about their health, coverage and living situation. Treat every conversation, contact record and intake request as protected health information.**

**Do**

- Keep member details inside CareConnect, where access is controlled and every change is logged.
- Use Staff notes on a contact for internal context — visitors never see them.
- Verify who you are speaking to before discussing specifics of someone's coverage.
- Share only what the visitor needs for the next step.

**Don't**

- Never paste member details into external tools, personal notes, spreadsheets or chat apps.
- Never take screenshots of transcripts to share outside the platform.
- Never email or text member information from your own account.
- Never leave the console open on an unattended screen.

> **Privacy — Your photo and name are private by default**
>
> Website visitors only see your name and photo if you switch on “Show my name and photo to website visitors” in My settings. It is off unless you turn it on.

### 16.2 Emergencies and crisis language

_React correctly when someone is in danger._

The assistant recognises crisis language and replies with your organization's emergency message before anything else. That message is configured in Organization settings and shown to the visitor immediately.

**If a visitor describes an emergency or self-harm**

1. Stay in the conversation. Do not transfer and walk away.
2. Repeat the emergency guidance in plain words: if there is immediate danger, they should call 911.
3. Do not attempt clinical advice, triage or diagnosis — CareConnect is not a clinical tool.
4. Escalate to a supervisor immediately and note what happened in the conversation.

> **Warning — Never promise an outcome**
>
> Do not promise eligibility, coverage, approval, timelines or payment. Say what the next step is and who will follow up.

### 16.3 What gets recorded

_Understand the audit trail that sits behind your work._

- Sign-ins, role changes, staff changes, settings changes and record edits are written to an append-only audit log.
- Conversation events — claims, transfers, reassignments, resolutions and closures — are recorded with who did them and when.
- Audit entries cannot be edited or deleted by anyone, including administrators.

> **Note — This protects you too**
>
> When a decision is questioned weeks later, the log shows exactly what happened and who acted. Work normally; the trail is there to support good work, not to catch you out.

---

## 17. When something looks wrong

Fix the everyday problems yourself, and know when to ask.

### 17.1 Common problems and their fixes

_Work through the usual suspects before raising a ticket._

**I signed in but I see a “no access” page.**

Your account exists but has no active membership in an organization. Ask an administrator to add you, or to re-enable your account if it was disabled.

**A menu item my colleague has is missing for me.**

Your role does not include it. Roles are cumulative — a Manager sees everything a Team Lead sees, and so on. Ask an administrator if the work you have been given needs a different role.

**I opened a conversation but there is no reply box.**

Either the conversation is closed, or it is unassigned, or a colleague owns it. Unassigned chats must be claimed first — that is what the Claim conversation button is for. A “View only” badge means you may read but not reply.

**I pressed Claim and got an error.**

Someone claimed it a moment before you, or you are already at your maximum simultaneous chats. Refresh the queue: if the conversation now shows another owner, it is handled.

**The Inbox badge shows waiting chats, but my Waiting tab is empty.**

The badge counts what is waiting across the queues you can see, including departments you are not a member of if your role can view them. Check the Department and All conversations tabs when your role has them.

**My dashboard numbers look different from a colleague's.**

Dashboards are scoped to what you may see: your own work, your departments, or the whole organization. Different roles legitimately see different totals for the same day.

**“Today” does not match my clock.**

Every date calculation uses your organization's timezone, not your browser's. An administrator sets it in Organization settings.

**I cannot open a visitor's attachment.**

Attachment links are generated on demand and expire. Return to the transcript and select View or Save again rather than reusing an old link.

**The AI answered something incorrect.**

Note the exact question. Anyone with knowledge editing rights can reproduce it in the AI console and fix the underlying article. Do not correct the visitor's record of what the assistant said — reply with the right answer instead.

**The page will not load or looks broken.**

Refresh once. If it persists, sign out and back in. If it still fails, tell an administrator what screen you were on and what you were doing.

### 17.2 Who to ask

_Send the question to the right person the first time._

| Question | Who can resolve it |
| --- | --- |
| I need access to a screen | An administrator in your organization |
| My role or departments are wrong | An administrator (roles) or your team lead (departments) |
| A conversation is with the wrong team | Your team lead — they can transfer or reassign it |
| The assistant needs better information | A manager or administrator with knowledge editing rights |
| Business hours, holidays or routing are wrong | An administrator |
| Something on the widget looks wrong on the public site | An administrator (Websites) |
| A possible privacy or security incident | An administrator immediately, then follow your internal policy |

> **Tip — Make the ask easy to answer**
>
> Include the screen you were on, the reference number (for example PHG-2041 or INT-1042), what you expected and what happened instead.

---

## 18. Words CareConnect uses

The vocabulary on screen, in plain English.

### 18.1 Glossary

_Decode any label you meet in the console._

- **Organization (tenant)** — One customer of the platform. Conversations, knowledge, staff and settings never cross between organizations.
- **Website** — A public site where the chat widget is embedded. Each website has its own branding, copy and assistant instructions.
- **Widget** — The chat panel a visitor sees on the public website.
- **Conversation** — One chat thread with a visitor, identified by a reference such as PHG-2041.
- **Claim** — Taking ownership of a waiting conversation. Only the owner (or a supervisor) may reply.
- **Escalation** — The moment a visitor asks for a human, or the assistant decides a person is needed.
- **Transfer** — Moving a conversation to a different department queue.
- **Reassignment** — Moving a conversation to a different person in the same department.
- **Department** — A routing target — the team that receives certain escalations, with its own hours and members.
- **Capacity** — The maximum simultaneous chats a person may own. Routing respects it.
- **Presence** — Your availability: Available, Busy, Away or Offline.
- **SLA** — The first-response target in minutes. A conversation that waits longer counts as a breach.
- **CSAT** — Visitor satisfaction, from the star rating a visitor gives after a chat.
- **Intake request** — A referral, enrollment, callback or general request captured from the widget, identified by a reference such as INT-1042.
- **Contact** — The person record behind conversations and intake requests.
- **Knowledge article** — Approved content the assistant searches when answering. Published articles are the assistant's source of truth.
- **FAQ** — A short question and answer pair shown directly in the widget.
- **Audit log** — The append-only record of who changed what, and when.

### 18.2 Conversation and request statuses

_Read any status badge correctly._

*Conversation statuses, exactly as the Inbox labels them*

| Badge | Meaning |
| --- | --- |
| AI handling | The assistant is answering; no person is needed yet |
| Waiting for human | A person is needed and nobody has claimed it |
| Claimed | Someone owns it but the conversation is not active yet |
| Active | A live back-and-forth is happening |
| Waiting for visitor | The ball is in the visitor's court |
| Internal follow-up | Waiting on internal work before the visitor hears back |
| Follow-up | Scheduled to be picked up again |
| Escalated | Explicitly raised for human help |
| Resolved | Finished with the visitor's need met |
| Closed | Finished without a resolution |
| Spam | Junk, excluded from reporting |
| Archived | Removed from active queues, retained for the record |

*Intake stages, in the order work normally moves*

| Stage | Meaning |
| --- | --- |
| new | Just arrived, nobody has looked at it |
| in review | Being assessed by staff |
| contacted | The person has been reached |
| eligibility check | Verifying qualification |
| submitted | Sent onward for a decision |
| approved | Accepted |
| denied | Not accepted |
| withdrawn | The person no longer wants to proceed |

---

## 19. Common mistakes and your final checklist

What goes wrong most often, and how to prove to yourself that you are ready.

### 19.1 Common mistakes to avoid

_Recognise the five habits that cause most of the rework._

**Seen most often in the first few weeks**

- Handing over a new organization before it has a staffed department and a catch-all routing rule.
- Fixing a tenant's operational setting without their administrator's agreement.
- Browsing tenant conversations for context instead of asking the tenant.
- Comparing one tenant's figures with another's in front of either of them.
- Forgetting that support access is attributed in the tenant's own audit log.

**Do**

- Run the same health check for every tenant: timezone, website, departments, hours, routing, administrators.
- Record why you entered a tenant before you do it.
- Fix configuration faults; escalate operational decisions to the tenant.
- Confirm each new organization has two working administrators before go-live.

**Don't**

- Do not treat tenant data as browsable, demo material or benchmarking input.
- Do not edit or attempt to reorder any tenant's audit trail.
- Do not leave a platform role assigned to someone who no longer needs it.
- Do not use a platform role to work around a tenant's own access rules.

> **Warning — A mistake is only a problem if you hide it**
>
> Every action is recorded with your name against it. If you send the wrong information, reply again with the correction and tell your team lead — do not try to make the record look tidier than it is.

### 19.2 Final checklist

_Tick every line before you work unsupervised._

**I can do all of this without help**

- [ ] Explain what my platform role grants and what it does not
- [ ] Onboard an organization end to end, including its first website
- [ ] Complete a per-tenant health check and record the result
- [ ] State the rule for when tenant data may be opened
- [ ] Describe how tenant isolation is enforced beneath the interface
- [ ] Show where my actions appear in a tenant's audit log
- [ ] Hand a configuration decision back to the right tenant administrator

> **Note — Keeping this guide honest**
>
> This material was last reviewed on 2 September 2026 against application build 2927660. If a screen in the console no longer matches what you read here, tell an administrator so the guide can be corrected.

---

## 20. Knowledge check

Five questions. Answer them from memory before you take your first live conversation.

### 20.1 Check yourself

_Confirm you can act correctly without looking anything up._

1. What is the first thing a new organization needs after it is created?

   A. An export
   B. Timezone, a website, staffed departments, routing and an administrator
   C. A quality review
   D. A knowledge check

   *Answer: B — Without a staffed department and a catch-all rule, escalations have nowhere to land.*

2. When is it appropriate to open a tenant's conversation data?

   A. Whenever you are curious
   B. Only for a specific, justified support task
   C. During onboarding demos
   D. To benchmark tenants against each other

   *Answer: B — Platform access is for support, and every action is attributed in that tenant's audit log.*

3. How is tenant isolation enforced?

   A. By hiding menu items
   B. In the database itself, underneath the interface
   C. By convention
   D. Only for conversations

   *Answer: B — Isolation is enforced at the data layer, so a mistake in the interface cannot leak another tenant's data.*

4. A tenant reports escalations sitting unanswered. What do you check first?

   A. Their brand colors
   B. Routing rules, department membership, business hours and staff availability
   C. The glossary
   D. Their CSV exports

   *Answer: B — Unanswered escalations almost always trace back to routing, staffing or hours.*

5. Which change should never be made without the tenant's administrator?

   A. Fixing a broken embed snippet
   B. Operational decisions such as roles, hours or published knowledge
   C. Checking their timezone
   D. Reading platform reports

   *Answer: B — Tenants own their operations. Support fixes configuration faults; it does not make their decisions.*
