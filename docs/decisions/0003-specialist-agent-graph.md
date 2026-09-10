---
status: accepted
date: 2026-09-10
decision-makers: team
---

# Orchestrate the agent as a graph of narrow specialist agents with typed outputs

## Context and Problem Statement

The hackathon requires meaningful, non-trivial use of Strands Agents (`docs/hackathon/SPEC.md` §2, §17). The product must turn a stream of emails and calendar events into persistent open loops, find evidence that closes them, judge risk, and act safely (§9). A single prompt over the inbox is fragile, unauditable and scores poorly; an "AI debate" with no roles is a gimmick.

## Considered Options

* One agent with one large prompt and every tool
* A Strands multi-agent graph (or orchestrator with specialists as tools) with one narrow role per agent
* A hand-written pipeline of plain model calls without an agent framework

## Decision Outcome

Chosen option: "Strands graph of narrow specialists", because it maps one agent to one responsibility, keeps every hop typed and testable, and is exactly the non-trivial framework use the judges score. Roles and outputs, from §9:

| Agent | Responsibility | Output |
|---|---|---|
| Extractor | Does this message or event create or modify a responsibility? | Typed candidate: action, deadline, requester, amount, source, confidence |
| Investigator | Search related and later sources for completion, change, duplication, contradiction | Evidence bundle and proposed state |
| Risk Judge | Consequence, urgency, uncertainty, whether approval is required | Risk tier, priority, recommended next action |
| Action Agent | Execute approved or low-risk work through tools | Action result, evidence, audit entry |
| Orchestrator | Route, write durable state, decide whether to interrupt the human | State transition and user-facing event |

Every agent returns structured, schema-validated output; the application validates before writing state or calling a tool. No agent sees raw chain-of-thought of another; evidence and short rationale are passed instead.

### Consequences

* Good, because each role can be prompted, tested and swapped independently, and the graph is demonstrable to judges.
* Good, because typed outputs let the frontend and the ledger stay deterministic.
* Bad, because five roles cost more model calls per event than one prompt; mitigated by classifying cheaply first and reserving stronger reasoning for ambiguous or high-risk candidates (§19).
* Bad, because it depends on the chosen Strands SDK supporting graph orchestration and structured output; verified in ADR-0007.

## More Information

Graph shape and the "what we should not do" list: `docs/hackathon/SPEC.md` §9.
