# Architecture Decision Records

One file per decision that is hard to reverse or whose *why* other people need: frameworks, services, data stores, auth, agent orchestration, deployment, observability, security posture. Not for trivia.

Format: MADR 4.0 minimal, see `adr-template.md`. Keep each under a page. Write it as a conversation with a teammate who joins next week.

## How to add one

1. Copy `adr-template.md` to `NNNN-short-title-with-dashes.md` using the next free number.
2. Fill in context, options considered, decision and consequences. Keep `status: proposed` until the team agrees, then `accepted`.
3. Add a row to the index below and open the PR. Claude Code: `/adr <title>` does steps 1 and 3.
4. Reversing a decision: write a new ADR and set the old one to `superseded by ADR-NNNN`. Do not rewrite an accepted ADR.

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions as ADRs | accepted |
| [0002](0002-repository-as-shared-project-memory.md) | The repository is the shared project memory for humans and agents | accepted |
