# builder.aws posts

Drafts for the optional scoring booster in SPEC §18: qualifying builder.aws posts about the build and the AWS implementation are worth **0.2 bonus points each, up to 0.6**, so three is the cap and three is what is here.

These are drafts. Nothing is published yet, and `SUBMISSION.md` stays unticked until something is.

| Draft | Angle | Judging criterion it serves |
|---|---|---|
| [01](01-orchestrator-is-not-an-agent.md) | The orchestrator is plain TypeScript; seven specialists behind a typed interface; Zod at every hop; bounded parallelism; the cheaper-Extractor trap | Technical Implementation |
| [02](02-safety-gate-is-code.md) | `mayExecute` is application code, not a prompt; actions are durable records; the lost-update race where an in-flight action reopened a resolved loop | Technical Implementation, Creativity |
| [03](03-observability-on-agentcore.md) | Structured JSON per pipeline step into CloudWatch; why the log group was empty; what must never be logged | Technical Implementation |

## Before publishing

- **Confirm the rules.** SPEC §18 is our own transcription. The rules page was already updated once, on Aug 12, to drop the `#AgentsforHumans` hashtag requirement. Check the live Devpost rules for the current wording, the cap, and **whether posts must exist before the submission deadline or may land during Stage Two** — that changes the urgency and nobody has verified it.
- **Keep "Agents for Humans" in the title.** Every draft does. The hashtag is no longer required; the title is what qualifies.
- **Team voice.** All three are written as "we", so any of us can publish any of them without the prose sounding wrong.
- **Check the numbers on the day.** Each post quotes measurements — 263 to 277 seconds sequential against 95 to 105 at concurrency 3, eight loops instead of nine from the Haiku Extractor. They were true at the time of writing and are the kind of thing that drifts.
- **Links.** Each ends with the repository. Add the live URL if the post is published after the deploy is public.
- **Claim only what is built.** These go out under our names and the rules require the project to behave as described. Effects are simulated through `FixtureActionSink`; live Gmail and Calendar writes are #21 and the web OAuth half of #20, both open. Post 02 says so explicitly and should keep saying so until they ship.

## Why these three

They are deliberately not a product pitch. SPEC §17 lists "a beautiful UI with Strands hidden behind one trivial call" as a judging trap, and the most useful thing we can say publicly is the opposite: here is where the model is, here is where it deliberately is not, and here is the bug we found at the seam. Each post carries at least one thing that went wrong, because a build log without one is marketing.
