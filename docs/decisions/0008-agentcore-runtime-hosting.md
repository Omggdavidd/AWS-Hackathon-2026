---
status: accepted
date: 2026-09-10
decision-makers: team
---

# Host the Strands agent on Amazon Bedrock AgentCore Runtime via the AgentCore CLI

## Context and Problem Statement

The rules score an AgentCore deployment explicitly under Technical Implementation (`docs/hackathon/SPEC.md` §17, §18). The agent must run on AWS, be invocable from the web app, and be deployable by a small team in hours, not days.

## Considered Options

* AgentCore Runtime, CodeZip build, scaffolded and deployed by the `@aws/agentcore` CLI
* AgentCore Runtime with a hand-built arm64 container pushed to ECR
* AWS Lambda or ECS Fargate without AgentCore
* Run the agent inside the Next.js server only

## Decision Outcome

Chosen option: "AgentCore Runtime via the CLI", because the CLI's TypeScript Strands template is documented end to end: `agentcore create`, `agentcore add agent --language TypeScript --framework Strands --model-provider Bedrock --build CodeZip`, `agentcore dev` for a local server with an inspector, `agentcore deploy` (CDK under the hood), `agentcore status`, `agentcore invoke`. It produces the HTTP contract the Runtime expects (`POST /invocations`, `GET /ping` on port 8080, SSE streaming) without writing server code.

Specifics:

* CLI pinned to `@aws/agentcore` 0.28.x (a 1.0 release candidate exists; do not chase it during the hackathon). Node 22, arm64-only packaging, 250 MB zip limit.
* Region `us-east-1`: Runtime, Memory, Identity and Browser are all available there and it is a source region for the global Claude inference profiles.
* The web app's server invokes the runtime with `@aws-sdk/client-bedrock-agentcore` (`InvokeAgentRuntimeCommand`) using IAM SigV4 and a session id per user conversation (at least 33 characters). Inbound JWT auth is not used, so the plain SDK path stays available.
* AgentCore Memory is optional (ADR-0004 keeps the ledger in our own store); if added, it is for user preferences only. AgentCore Identity is not used for Google OAuth (ADR-0011). Browser and Gateway remain stretch items.
* Observability: CloudWatch logs and runtime metrics come automatically. Per-step LLM and tool traces for TypeScript agents are not yet documented on AgentCore; the demo shows the local inspector and the application's own audit feed instead.

### Consequences

* Good, because deployment is a handful of documented commands and the judges see a real AgentCore runtime.
* Good, because `agentcore dev` gives every developer a faithful local runtime without Docker.
* Bad, because the CLI dictates part of the layout (`agentcore/` config plus `app/<Agent>/`); the repository layout in ADR-0012 accommodates it rather than fighting the generator.
* Bad, because first deploy bootstraps CDK and needs broad IAM permissions on the AWS account; done once, early, by whoever owns the account.

## More Information

* CLI TypeScript tutorial: <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-get-started-cli-typescript.html>
* Runtime HTTP contract: <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-http-protocol-contract.html>
* Invoking a runtime: <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-invoke-agent.html>
* Regions: <https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/agentcore-regions.html>
