---
status: proposed
date: 2026-09-10
decision-makers: team
---

# Build in TypeScript with the Strands TypeScript SDK on Amazon Bedrock

## Context and Problem Statement

Strands Agents is mandatory (`docs/hackathon/SPEC.md` §18). The playbook recommends TypeScript so that the web UI, shared schemas and the agent share one language (§3, §15). The official Strands overview describes the Python quickstart as having "full feature access" and the TypeScript one without that phrase, so the TypeScript gaps had to be verified before committing.

## Considered Options

* TypeScript everywhere: `@strands-agents/sdk` for the agent, Next.js for the UI, one Zod schema package shared by both
* Python agent (`strands-agents`) with a TypeScript UI and duplicated schemas
* Python everywhere with a minimal server-rendered UI

## Decision Outcome

Chosen option: "TypeScript everywhere", because as of `@strands-agents/sdk` 1.17.0 (2026-09-08, Node 22+) every capability this product needs is officially supported in TypeScript: Graph, Swarm and agents-as-tools orchestration, Zod `structuredOutputSchema` with automatic validation and retry, `tool()` with Zod input schemas, hooks, sessions with pluggable storage, OpenTelemetry tracing, and a documented AgentCore Runtime deployment path. Verified TypeScript gaps that do not matter here: no ready-made `workflow` tool (Graph covers it), no Ollama or LiteLLM providers, four built-in tools instead of thirty (all our tools are custom), no conditional-edge runtime context in Graph, no bidirectional voice streaming.

Model provider: Amazon Bedrock, the Strands default, for a clean AWS story. Default model `global.anthropic.claude-sonnet-4-6` (the SDK default) for every role; `global.anthropic.claude-haiku-4-5-20251001-v1:0` may be substituted for the Extractor if cost or latency demands it. Bedrock model access is enabled by default, but Anthropic models require the one-time First Time Use form on the AWS account before the first invoke.

Runtime baseline: Node 22 LTS, required by Strands, the Google client libraries and AgentCore CodeZip alike.

### Consequences

* Good, because one language means one schema package, one test runner, one lint setup and no cross-language contract drift in four days.
* Good, because the stack matches the AgentCore CLI's TypeScript Strands template, so the generated project is the starting point rather than a port.
* Bad, because TypeScript has fewer Strands samples and community tools; mitigated by the small, custom tool surface in ADR-0003.
* Bad, because per-step trace instrumentation for TypeScript agents on AgentCore is not yet documented (ADR-0008); OpenTelemetry from the SDK itself still works locally.

## More Information

* Strands parity table: <https://strandsagents.com/docs/user-guide/quickstart/overview/>
* Graph in TypeScript: <https://strandsagents.com/docs/user-guide/concepts/multi-agent/graph/>
* Structured output: <https://strandsagents.com/docs/user-guide/concepts/agents/structured-output/>
* Bedrock model access and the Anthropic use-case form: <https://docs.aws.amazon.com/bedrock/latest/userguide/model-access.html>
