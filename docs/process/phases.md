# Development phases

The project moves through explicit phases so that agents do not try to build everything at once. `STATUS.md` states the current phase. A phase changes because the project actually progressed, agreed in a PR that updates `STATUS.md`, never because an agent finished a session. Workstreams may overlap at the edges; major implementation stays deliberate.

| Phase | Name | Focus | Exit condition |
|---|---|---|---|
| 0 | Repository methodology | Shared context, agent instructions, docs architecture, Git/PR workflow, Context Sync, automation | Foundation merged; hackathon specification received |
| 1 | Understand and plan | Read the spec deeply; constraints, judging criteria, required technologies; research official docs; architecture; MVP scope; risks; implementation plan; ADRs for major choices | Architecture and MVP scope recorded in ADRs and `docs/architecture.md`; plan in `docs/plans/` |
| 2 | Foundation | Workspace layout, frontend/backend/agent/AWS foundations, shared schemas, env config, test/lint/build tooling, CI | A skeleton runs end to end and `AGENTS.md` *Commands* is filled in |
| 3 | MVP development | Complete vertical slices in small, reviewable PRs | Core demo path works end to end |
| 4 | Integration and hardening | Edge cases, error handling, security, tests, performance, agent and AWS reliability, UX, observability, docs | Demo path is reliable under realistic conditions |
| 5 | Submission and demo | Demo reliability, judging criteria, README, architecture diagram, submission requirements, presentation flow, deployment, backup demo plan | Submitted |

Rules for agents:

- Work inside the current phase. If the task needs something from a later phase, say so and stop at the boundary.
- Do not advance the phase yourself. Propose it in the PR that updates `STATUS.md`.
- Phase 1 does not start until `docs/hackathon/SPEC.md` exists.
