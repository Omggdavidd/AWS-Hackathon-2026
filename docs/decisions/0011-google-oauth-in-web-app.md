---
status: accepted
date: 2026-09-10
decision-makers: team
---

# The web app owns Google OAuth in Testing status; the agent receives tokens per invocation and polls

## Context and Problem Statement

Live Gmail and Calendar are the second demo path after seeded data (ADR-0006). Gmail read and compose scopes are classified as restricted by Google, which requires a verification process taking weeks for production apps. The agent runs on AgentCore and needs Google credentials at tool-call time.

## Considered Options

* OAuth handled by the Next.js server with the Google Cloud project in Testing status; the server passes a short-lived access token to the agent in the invocation payload; polling for new mail
* AgentCore Identity outbound OAuth (user federation) so the agent owns the Google consent flow
* Gmail push notifications through Pub/Sub

## Decision Outcome

Chosen option: "Web app owns OAuth, Testing status, tokens per invocation, polling", because it is the least machinery: a Google Cloud project with the Gmail and Calendar APIs enabled, a web OAuth client, team members added as test users, `google-auth-library` on the server, refresh tokens stored server-side per user. Testing status needs no verification; its limits (100 test users, consent and refresh tokens expiring after 7 days) are irrelevant inside a 4-day window. Scopes requested: `gmail.readonly`, `gmail.compose`, `calendar.events`; `gmail.send` is added only if a demo action needs it, and sending stays behind the high-risk approval gate (ADR-0005). Ingestion polls `messages.list` with a query, then `history.list` deltas; Pub/Sub push is a stretch.

AgentCore Identity was rejected because its user-federation flow requires JWT inbound auth or the development-only user-id header, a callback and session-binding handler, and it is documented for Python only.

### Consequences

* Good, because the whole integration is a known Next.js OAuth pattern and the agent's Gmail tools stay stateless.
* Good, because scopes are least-privilege and the token never reaches the browser.
* Bad, because a live-inbox demo requires re-consent every 7 days; the recorded demo uses seeded data anyway.
* Bad, because polling adds latency to "email arrives, agent reacts"; the demo narrates a catch-up scan, which polling serves well.

## More Information

* Gmail scopes and their classification: <https://developers.google.com/gmail/api/auth/scopes>
* Testing status limits: <https://support.google.com/cloud/answer/15549945>
* Gmail sync guide: <https://developers.google.com/workspace/gmail/api/guides/sync>
