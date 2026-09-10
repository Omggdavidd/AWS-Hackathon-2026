# Architecture

Not yet established. The system design follows from the hackathon specification (`docs/hackathon/SPEC.md`, pending) and the decisions recorded in `docs/decisions/`. Whether this becomes a monorepo, and how the workspaces are laid out, is a Phase 1 decision recorded as an ADR.

When the first component lands, this file becomes the map of the system. Keep it short, since every contributor reads it, and structure it as:

1. **Problem and shape**: one paragraph on what the system does and its main runtime pieces.
2. **Component map**: for each app and package, what it is responsible for and what it must not do. Name important modules and types; do not link line numbers.
3. **Data flow**: the path from user to backend to agents to AWS services and back.
4. **Boundaries and invariants**: what talks to what, what is forbidden (for example, "the frontend never calls Bedrock directly"), and where schemas are the source of truth.
5. **Deployment**: environments and how code reaches AWS.
6. **Cross-cutting**: auth, observability, error handling, cost controls.

Diagrams and images, when they exist, go in `docs/architecture/` and are linked from here. Rationale for decisions goes in ADRs, not here.
