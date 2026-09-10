---
status: accepted
date: 2026-09-10
decision-makers: team
---

# Build the product UI with Next.js 16 and host it on Vercel

## Context and Problem Statement

The product is dashboard-first, not chat-first (`docs/hackathon/SPEC.md` §7, §8): a home dashboard with four states, a loop detail view with evidence and timeline, an approval flow, an activity feed and a command bar. A live demo link is an explicit scoring booster (§18). The playbook says not to spend a day on hosting.

## Considered Options

* Next.js 16 (App Router, TypeScript, Tailwind) hosted on Vercel
* Next.js hosted on AWS Amplify Hosting
* Vite single-page app on S3 and CloudFront calling a separate API

## Decision Outcome

Chosen option: "Next.js 16 on Vercel", because `create-next-app` gives TypeScript, Tailwind, App Router and Turbopack by default, server routes give the UI a backend for OAuth callbacks and for invoking the AgentCore runtime with server-side AWS credentials, and Vercel deploys the repository with zero configuration, preview URLs per PR and production on merge to `main`. Amplify Hosting was rejected because its documentation lists Next.js support only through version 15 and open issues exist for the Turbopack build. The AWS story is carried by Bedrock, AgentCore and DynamoDB, not by the static host.

UI conventions from §8: calm, high-trust visual direction; no raw chain-of-thought on screen; evidence, confidence and action history instead.

### Consequences

* Good, because the frontend team is productive in the first hour and the live demo link exists from the first deploy.
* Good, because the Next.js server is the only holder of AWS and Google credentials; the browser never sees them.
* Bad, because part of the system runs outside AWS; acceptable to the rules, and stated plainly in the architecture diagram.
* Bad, because Vercel preview deployments need environment variables configured once by whoever owns the Vercel project.

## More Information

* Next.js installation defaults: <https://nextjs.org/docs/app/getting-started/installation>
* Vercel Next.js deployment: <https://vercel.com/docs/frameworks/full-stack/nextjs>
* Amplify SSR support matrix: <https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html>
