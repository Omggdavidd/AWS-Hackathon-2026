# Devpost text

Paste-ready copy for the Devpost form. The About page of the live app and the README carry the same stories, so edit all three together.

## Tagline

Open Loops keeps track of the things you said you would do and never did.

## Inspiration

Obligations arrive as email and quietly expire there. A registration deposit due Friday, a form a professor is waiting on, an internship application that got a "thanks for applying" and nothing since. Inbox assistants summarize what arrived; nothing tracks what is still open. We wanted an agent that does the follow-through, not the reading.

## What it does

Open Loops reads your inbox and calendar and keeps a persistent, evidence-backed ledger of every responsibility that is still open. Each loop is in one of four states: **Needs you**, **Waiting** on someone else, **Watching** for a change, or **Resolved**, and every claim links to the exact message or calendar event it came from.

- **Finds responsibilities, not emails.** An Extractor decides whether a thread contains something you owe someone; a newsletter produces nothing.
- **Checks whether it is already done.** An Investigator searches later mail and calendar entries for the receipt, the reply, the confirmation, so a paid invoice never nags you.
- **Sorts by consequence.** A Risk Judge assigns a risk tier, a priority, the next concrete action, and decides whether this is worth interrupting you for. Most loops arrive quietly.
- **Handles what it safely can.** It drafts the replies, creates the calendar events and sets the reminders. Sending mail, paying and anything high-risk waits for your approval, and that gate is enforced in application code, not in a prompt.
- **Keeps up on its own.** New mail updates existing loops instead of duplicating them. Every morning the agent checks in by itself and *Catch me up* tells you what changed since you last looked. Ask it a question about your loops from the command bar.

## Who it is for

- **Students.** Deposits, forms and fees, kept open until the receipt or confirmation shows up in your mail, with the deadline on your calendar.
- **Applications and follow-ups.** You applied, they said thanks, and nothing since. The ledger knows who owes the next move, the agent drafts the follow-up, and the loop closes when the reply arrives.
- **A manager buried in mail.** A hundred messages a day, six of which carry a real request. The ledger holds only what is owed and to whom; everything else stays quiet.
- **Time away.** A week of leave, or a week when the inbox is too much. The agent checks in on its own, says what changed, and only a decision that is genuinely yours interrupts you.

## How we built it

Strands Agents TypeScript SDK on Amazon Bedrock (Claude Sonnet 4.6), deployed to Amazon Bedrock AgentCore Runtime. The ledger is one DynamoDB table behind a storage adapter; the UI is Next.js 16 on Vercel. Specialist agents produce typed, schema-validated output and the application owns the state machine, so the model interprets evidence but never decides the lifecycle. A daily EventBridge Scheduler run makes the agent check in unattended. The demo runs on a seeded inbox so a judge can click through without connecting anything; the live Gmail and Calendar reader is built and waits on sign-in.

## Challenges

Making the ledger trustworthy rather than another inbox: the Investigator has to prove a loop is closed from later evidence, and a loop must belong to the thread it was found in even when the model quotes mail from elsewhere. Keeping unattended operation defensible: the interrupt decision is stored on the loop and is the only thing that raises a notification. Keeping the scan fast without paying for it twice: three threads at a time cut a scan from four minutes to under two.

## What is next

1. Your real inbox: the Gmail and Calendar reader is built; the sign-in is next.
2. Real effects, still gated: drafts saved into Gmail and events on your actual calendar; sending and paying keep waiting for approval.
3. Follow-ups with a clock: no reply in two weeks becomes a nudge on its own.
4. Several inboxes, one ledger, grouped by the area of life they belong to.
5. Read it to me: a spoken morning digest and questions out loud.
6. Where obligations also live: school portals, billing notices, shared team inboxes.

## Links

- Live demo: https://openloop-neon.vercel.app
- Source: https://github.com/Omggdavidd/AWS-Hackathon-2026
- Architecture: docs/architecture/openloop-architecture.png in the repository
