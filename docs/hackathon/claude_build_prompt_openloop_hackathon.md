You are working inside an EXISTING GitHub repository for our AWS Hackathon 2026 project.

The repository has already been created and connected to GitHub.

Do NOT create a new repository.
Do NOT reinitialize Git.
Do NOT change the Git remote.
Do NOT start building the actual hackathon application yet.

We are a small team of developers collaborating through GitHub, feature branches, pull requests, and AI coding agents such as Claude Code, Cursor, Codex, or similar tools.

Our goal is to establish a modern development methodology where the repository itself becomes the shared source of truth for both humans and AI agents.

I will provide you with the detailed hackathon/project specification AFTER this setup.

The actual product will be developed incrementally over multiple sessions and by multiple team members.

Do NOT attempt to one-shot the entire project.

---

# CORE OBJECTIVE

Set up this existing repository so that:

* every developer can work independently on a branch
* every developer's AI coding agent can understand the same project
* important project context is stored in Git rather than trapped inside private AI conversations
* architecture decisions are documented
* current project status is visible
* agents know how to begin and end work
* context stays synchronized as branches are merged
* new team members can quickly understand the project
* AI agents do not need the entire repository dumped into context every session
* `main` represents both the current codebase and the current shared project knowledge

Think of the repository as a shared memory system for the team.

---

# PHASED DEVELOPMENT MODEL

Design the repository and workflow around explicit phases.

We are currently in:

## PHASE 0 — Repository Methodology & Shared Context

Your task NOW is only to establish:

* repository organization
* AI-agent instructions
* documentation architecture
* team development conventions
* Git / PR methodology
* context synchronization
* architecture decision tracking
* project status tracking
* development/session protocols
* lightweight automation where useful

Do NOT implement application features during Phase 0.

After this, I will provide the hackathon specification.

Future work will roughly follow:

## PHASE 1 — Understand & Plan

After receiving the hackathon specification:

* understand the problem deeply
* identify hackathon constraints
* identify judging criteria
* identify required technologies
* research relevant official documentation
* determine the architecture
* identify MVP scope
* identify risks
* create an implementation plan
* record major architectural decisions

Do not build significant features until this phase is sufficiently understood.

## PHASE 2 — Foundation

Establish the actual technical foundation once architecture is agreed upon:

* workspace/monorepo configuration if appropriate
* frontend foundation
* backend/API foundation
* agent foundation
* AWS foundation
* shared schemas/types
* environment configuration
* testing/linting/build tooling
* CI where appropriate

## PHASE 3 — MVP Development

Build the core end-to-end product incrementally.

Prefer complete vertical slices over building disconnected systems.

Features should be implemented in small, reviewable units through branches and pull requests.

## PHASE 4 — Integration & Hardening

Focus on:

* integration
* edge cases
* error handling
* security
* testing
* performance
* agent reliability
* AWS reliability
* UX quality
* observability
* documentation

## PHASE 5 — Hackathon Submission & Demo

Focus on:

* demo reliability
* judging criteria
* README
* architecture diagram
* submission requirements
* presentation/demo flow
* deployment
* final testing
* backup demo plan

These phases are guidelines, not rigid bureaucracy.

They exist to prevent agents from trying to build the entire project prematurely.

---

# FIRST: INSPECT THE EXISTING REPOSITORY

Before changing anything:

1. Inspect the current repository.
2. Inspect the current Git branch.
3. Inspect existing files and directories.
4. Inspect existing documentation.
5. Inspect Git configuration relevant to the project.
6. Understand what has already been established.
7. Preserve useful existing work.

Do not overwrite useful files without understanding them.

If an appropriate file already exists, improve it instead of unnecessarily creating a duplicate.

---

# RESEARCH MODERN PRACTICES

Before designing the methodology, research current 2026 best practices and official documentation relevant to:

* Claude Code project configuration
* `CLAUDE.md`
* `AGENTS.md`
* AI-assisted development repositories
* shared coding-agent instructions
* multi-agent / multi-developer workflows
* documentation-as-code
* progressive context loading
* Architecture Decision Records
* GitHub branch + pull-request workflows
* monorepo organization where appropriate
* Claude Code rules
* Claude Code skills
* Claude Code hooks
* AI coding-agent session management
* keeping project knowledge synchronized across developers

Prefer:

1. official documentation
2. established standards
3. authoritative engineering references

over random blog posts.

Do not blindly implement every practice you find.

Optimize for a SMALL, FAST-MOVING HACKATHON TEAM.

We want discipline without bureaucracy.

---

# SHARED PROJECT MEMORY

Establish a coherent documentation system.

At minimum, evaluate and create or update appropriate versions of:

`CLAUDE.md`
`AGENTS.md`
`README.md`
`CONTRIBUTING.md`
`STATUS.md`

Also evaluate whether we need:

* architecture documentation
* Architecture Decision Records
* setup documentation
* testing documentation
* security documentation
* roadmap/planning documentation
* API documentation
* demo/submission documentation

Prefer placing detailed documentation under `docs/` instead of filling the repository root with dozens of Markdown files.

Every document must have ONE clear responsibility.

Avoid duplicating the same information across multiple documents.

---

# CLAUDE.md

Create or improve the root `CLAUDE.md`.

This is Claude's high-signal project briefing.

It should remain concise.

Do NOT turn it into a massive project encyclopedia.

It should contain or reference:

* brief project identity
* current development philosophy
* repository orientation
* critical commands once known
* non-negotiable project conventions
* how Claude should start work
* how Claude should finish work
* Context Sync requirements
* where project status lives
* where architecture lives
* where decisions live
* where the hackathon specification lives
* where more specialized instructions live

Use progressive disclosure.

Claude should know WHERE to retrieve information without loading every document automatically.

If future portions of the repository would benefit from scoped `CLAUDE.md` files, document when those should be introduced rather than creating unnecessary ones now.

---

# AGENTS.md

Create or improve `AGENTS.md`.

This should be the agent-agnostic development contract for AI coding systems.

The goal is that Claude, Codex, Cursor agents, or another capable coding agent can enter the repository and understand the essential working rules.

Include things such as:

* repository orientation
* expected development behavior
* build/test/lint expectations once known
* Git expectations
* coding conventions
* documentation responsibilities
* safety rules
* Definition of Done
* Context Sync Protocol
* how agents should deal with uncertainty
* how agents should handle architecture changes
* how agents should surface incomplete work

Avoid duplicating everything from `CLAUDE.md`.

A good conceptual distinction is:

`AGENTS.md`
= shared rules for any AI coding agent

`CLAUDE.md`
= Claude-specific entry point and behavior

Determine the best implementation based on current standards.

---

# STATUS.md

Create `STATUS.md` as the project's CURRENT operational snapshot.

It should answer:

* What phase are we currently in?
* What works?
* What is currently being built?
* What was recently completed?
* What is blocked?
* What are the most important known issues?
* What should happen next?
* Is the demo currently runnable?
* Are there important temporary limitations?
* What major workstreams currently exist?

This document is NOT a permanent changelog.

Keep it concise.

Old completed information should eventually leave `STATUS.md`.

Git history and other documentation can preserve history.

---

# ARCHITECTURE

Create an appropriate architecture documentation location.

Likely something similar to:

`docs/architecture/`

Do NOT invent the architecture yet.

The hackathon specification has not been provided.

Create the structure and conventions necessary to document architecture once decisions are made.

---

# ARCHITECTURE DECISION RECORDS

Establish a lightweight ADR system if appropriate.

Likely:

`docs/decisions/`

Create a simple ADR template.

An ADR should capture things such as:

* title
* status
* context
* decision
* alternatives considered
* consequences
* date

Do NOT populate fake decisions.

Future examples may include:

* frontend framework
* backend framework
* database
* AWS services
* authentication
* Strands Agents SDK architecture
* agent orchestration
* deployment strategy
* observability
* state management
* API design

Important architectural choices should not disappear inside private Claude conversations.

---

# HACKATHON DOCUMENTATION

Create a dedicated location for the hackathon information I will provide next.

Prefer something like:

`docs/hackathon/`

The detailed specification I provide should become a canonical repository document.

Potential organization may eventually include:

`docs/hackathon/SPEC.md`
`docs/hackathon/RULES.md`
`docs/hackathon/JUDGING.md`
`docs/hackathon/SUBMISSION.md`
`docs/hackathon/DEMO.md`

Do not create filler content.

Only create empty structure/templates when they genuinely help.

When I provide the full hackathon document, preserve its important information and organize it appropriately rather than losing details through summarization.

---

# TEAM WORKFLOW

We are working as a team.

Do NOT assign specific tasks to specific people unless we explicitly ask you to later.

Instead, establish a collaboration methodology that works regardless of who takes each feature.

Assume:

* multiple developers
* multiple AI agents
* parallel development
* feature branches
* pull requests
* frequent integration
* limited hackathon time

Create a lightweight branch strategy.

Something approximately like:

`feature/...`
`fix/...`
`docs/...`
`chore/...`

Do not over-engineer Git Flow.

`main` should remain the integration source of truth.

Developers should generally:

1. update local `main`
2. create a focused branch
3. work with their AI agent
4. test the work
5. perform Context Sync
6. push the branch
7. open a PR
8. review
9. merge
10. other developers pull the updated `main`

Document how to handle conflicts and stale branches.

---

# CONTEXT SYNC PROTOCOL

This is one of the MOST important parts of the repository.

We want every developer's AI agent to eventually possess the same important project knowledge through Git.

Before a pull request is considered ready to merge, the developer's coding agent should perform a Context Sync.

The agent must:

1. Inspect the complete branch diff.

2. Understand what actually changed.

3. Read the relevant shared project-context files.

4. Determine whether the change affects:

   * project status
   * architecture
   * architectural decisions
   * commands
   * setup
   * dependencies
   * environment variables
   * API contracts
   * schemas
   * agent behavior
   * project conventions
   * known limitations
   * testing
   * deployment
   * security assumptions
   * hackathon requirements
   * demo behavior

5. Update ONLY the documentation affected by the work.

6. Update `STATUS.md` when the project's current operational state changed.

7. Create or update an ADR if a meaningful architectural decision was introduced, reversed, or materially changed.

8. Update `AGENTS.md` only when shared AI-development instructions genuinely changed.

9. Update `CLAUDE.md` only when Claude's always-on project instructions genuinely changed.

10. Update developer/setup/testing/API documentation where applicable.

11. Detect and remove stale documentation discovered during the work.

12. Run all relevant tests/checks.

13. Inspect the final diff again.

14. Verify no credentials, secrets, tokens, or sensitive configuration were committed.

15. Explicitly report:

`Context Sync: PASS`

or

`Context Sync: INCOMPLETE`

with an explanation.

The invariant is:

CODE
+
CURRENT STATUS
+
ARCHITECTURE
+
DOCUMENTATION
+
AGENT CONTEXT

must agree before merge.

Do NOT modify Markdown files merely to satisfy a checklist.

We want semantic synchronization, not meaningless documentation churn.

---

# AI SESSION START PROTOCOL

Define an efficient protocol for an AI agent starting significant work.

It should use progressive disclosure.

For example:

1. Read `AGENTS.md`.
2. Read root `CLAUDE.md` if Claude is being used.
3. Read `STATUS.md`.
4. Understand the user's assigned task.
5. Inspect the relevant code.
6. Load only relevant architecture documentation.
7. Load relevant ADRs.
8. Inspect recent Git history if useful.
9. Confirm current branch.
10. Plan the implementation.

The agent should NOT automatically load every Markdown document in the repository for every task.

Context should be retrieved according to relevance.

---

# AI SESSION END PROTOCOL

Before an AI agent declares substantial work complete, require it to:

1. inspect what it changed
2. run relevant tests
3. run lint/typecheck/build where applicable
4. verify expected behavior
5. inspect the Git diff
6. perform Context Sync
7. update relevant documentation
8. surface unresolved issues
9. avoid hiding failed checks
10. make the repository understandable to the next developer/agent

A future Claude session should not need the previous Claude chat to understand what happened.

---

# TASK / IMPLEMENTATION PLANNING

Establish a place for implementation plans when work is sufficiently complex.

Do NOT require a plan document for tiny changes.

For substantial features, the agent should be able to create a lightweight implementation plan that describes:

* objective
* scope
* affected systems
* proposed approach
* dependencies
* risks
* validation strategy
* unresolved questions

Plans should help multiple developers coordinate without becoming bureaucracy.

Determine an appropriate location, likely under something such as:

`docs/plans/`

Do not create unnecessary plans during Phase 0.

---

# DEFINITION OF DONE

Create a lightweight shared Definition of Done.

For meaningful feature work, "done" should generally mean:

* requested behavior exists
* relevant tests pass
* build/typecheck/lint passes where applicable
* errors are handled appropriately
* no secrets were committed
* architecture remains coherent
* relevant docs are accurate
* Context Sync completed
* STATUS reflects reality if affected
* the branch is ready for review
* unresolved issues are explicitly surfaced

Do not allow an agent to call something complete merely because code was generated.

---

# PULL REQUESTS

Create a concise GitHub pull request template.

It should include sections such as:

## What changed

## Why

## How to test

## Context / architecture impact

and a concise checklist such as:

* [ ] Relevant tests/checks pass
* [ ] Final diff reviewed
* [ ] STATUS.md updated if necessary
* [ ] Architecture / ADRs updated if necessary
* [ ] Setup/environment/API docs updated if necessary
* [ ] AGENTS.md / CLAUDE.md remain accurate
* [ ] No secrets committed
* [ ] Context Sync completed

Keep this lightweight.

---

# AUTOMATION

Research what portions of this methodology can reasonably be automated.

Consider:

* GitHub Actions
* PR templates
* lint/test/build checks
* secret scanning
* formatting checks
* Claude Code hooks
* helper scripts
* documentation validation

Follow this rule:

AUTOMATE DETERMINISTIC CHECKS.
DO NOT PRETEND TO AUTOMATE SEMANTIC JUDGMENT.

For example:

A script can determine whether tests pass.

A script cannot reliably determine whether `STATUS.md` accurately represents the conceptual state of the project.

Keep automation lightweight for now.

Do not introduce elaborate CI infrastructure during Phase 0 unless clearly justified.

---

# EXPECTED FUTURE REPOSITORY AREAS

The detailed hackathon specification may eventually require things such as:

* web frontend
* backend/API
* AI agents
* AWS services
* Strands Agents SDK
* shared schemas/types
* infrastructure
* tests
* scripts
* documentation

Do NOT assume the exact architecture yet.

Do NOT install frameworks simply because these systems may exist.

Wait for the hackathon specification.

You may create only the structural foundation necessary for future work.

---

# MONOREPO

Research whether a monorepo is appropriate for this project.

Given that this may include a frontend, backend, agents, shared packages, and infrastructure, it may make sense.

However:

Do NOT commit us to a monorepo simply because it sounds modern.

Make the recommendation after you understand the hackathon specification.

During Phase 0, avoid creating speculative application directories that may later be wrong unless they are harmless placeholders.

---

# PRINCIPLES

Optimize this project for:

* fast hackathon execution
* team collaboration
* AI-agent interoperability
* shared context
* progressive disclosure
* minimal context-token waste
* documentation that remains useful
* low duplication
* clean architecture
* reproducibility
* simple onboarding
* understandable Git history
* incremental development
* reviewable changes

Avoid:

* giant `CLAUDE.md` files
* duplicated instructions
* unnecessary Markdown files
* fake documentation
* speculative architecture
* over-engineering
* premature abstraction
* huge dependency installations
* AI-generated filler
* one-shot implementation attempts
* workflows too bureaucratic for a hackathon

---

# PHASE DISCIPLINE

Claude should always understand which project phase it is operating in.

Record the current phase in `STATUS.md`.

Do not automatically advance phases.

The current phase should change because the actual project has progressed, not simply because an AI agent finished responding.

Different workstreams may overlap somewhat, but major implementation should remain deliberate.

---

# IMPORTANT TEAM CONTEXT RULE

Anything important enough that another developer or another developer's coding agent needs to know SHOULD NOT exist exclusively inside this conversation.

It should eventually be represented appropriately in:

* code
* documentation
* STATUS
* an ADR
* an implementation plan
* issue/PR context
* or another canonical repository artifact

Private Claude chat history is NOT authoritative project documentation.

The repository is.

---

# YOUR TASK RIGHT NOW

You are ONLY completing Phase 0.

Do the following:

1. Inspect the repository.
2. Research appropriate modern practices.
3. Design the shared-context methodology.
4. Create/update the appropriate documentation structure.
5. Create the agent instructions.
6. Establish Context Sync.
7. Establish session start/end protocols.
8. Establish team Git/PR methodology.
9. Add a lightweight PR template.
10. Add only clearly useful deterministic automation.
11. Prepare the location for the hackathon specification.
12. Update `STATUS.md` to indicate that repository methodology is established and the project is awaiting the detailed hackathon specification.

Do NOT:

* build the application
* choose speculative frameworks
* choose speculative AWS services
* implement agents
* install large dependency trees
* create fake architecture
* delegate tasks to team members
* begin Phase 1 without my specification

---

# FINAL RESPONSE

When Phase 0 is complete, show me:

1. The resulting repository tree.

2. Every important file you created or modified.

3. What each documentation/context file owns.

4. Which file is authoritative for each category of project knowledge.

5. How `CLAUDE.md` and `AGENTS.md` work together.

6. The Context Sync Protocol.

7. The AI Session Start Protocol.

8. The AI Session End Protocol.

9. The Git/branch/PR methodology.

10. Any automation added.

11. Anything you deliberately chose NOT to add and why.

12. The exact location where I should place the detailed hackathon specification.

13. The current Git status.

14. Any changes that should be committed.

Then STOP.

Do not begin product implementation.

My next step will be to provide the detailed AWS Hackathon 2026 specification.
