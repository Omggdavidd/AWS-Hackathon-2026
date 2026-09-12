# Hackathon material

Source of truth for what we are building toward and how we will be judged. Our own plans go in `docs/plans/`; decisions go in `docs/decisions/`.

| File | Contains |
|---|---|
| `SPEC.md` | The full team playbook, converted from the original Word document without summarization. Product thesis, tracks and judging model (§2, §17), product and UX design (§4 to §8), agent design (§9), AWS/AgentCore (§10), data model (§11), safety (§12), MVP scope (§13), demo story (§14), recommended stack and layout (§15), execution calendar (§16), rules (§18), references (§21) |
| `SUBMISSION.md` | Living checklist of dates, eligibility steps and required assets |
| `state-lifecycle.png`, `architecture-proposal.png` | Diagrams from the playbook. `state-lifecycle.png` still describes the loop states; `architecture-proposal.png` is only a record of the original proposal and does not describe what was built. The submission architecture diagram is [`docs/architecture/`](../architecture/README.md) |
| `aws_agents_for_humans_openloop_team_playbook.docx` | Original source of `SPEC.md`. Not authoritative once `SPEC.md` diverges |
| `claude_build_prompt_openloop_hackathon.md` | The Phase 0 methodology brief that produced this repository structure. A prompt, not organizer material |

Rules and judging criteria are not split into separate files: `SPEC.md` §17 and §18 own them. A `DEMO.md` is created in Phase 5 when the demo script diverges from `SPEC.md` §14.

The playbook's recommended stack, repository layout and team split are proposals. They become decisions only through ADRs, and ownership only through `STATUS.md`.
