# Front-end revamp: a product, not a dashboard

Status: active
Owner: Omggdavidd
Related: SPEC §7, §8A, §8B, §8H, §12; ADR-0006 (Next.js on Vercel); the ranked list the team reviewed on 2026-09-13

## Objective

A first-time visitor on any screen size understands what Open Loops is within a minute, sees what waits on their decision before anything else, and can read and act on a loop without leaving the list. The three views (List, Board, Calendar) stay; everything around them gets rebuilt.

## Scope

In, in this order, one PR each:

1. **Shell** (#105). Primary navigation as routes: `/` Today, `/board`, `/calendar`, `/decisions`, `/activity`, `/about`. A slim icon rail on desktop, bottom tabs on phones. The header carries the agent and its last check, the bell and the theme toggle; "Personal workspace" goes. On screens 1100px and wider, Today is two panes: the list on the left and the selected loop on the right (`/?loop=<id>`), so a loop opens without leaving the list and the arrow keys move the selection. Below that width the same URL opens the loop as a sheet over the list. `/loops/[id]` stays as the full page for deep links. `?view=board` and `?view=calendar` redirect to the new routes.
2. **Rows and board grouping** (#106). Fixed row columns: area icon, title clamped to two lines, who and what kind, due in words, state. Row actions become Open and Source; Done leaves the row (it lives in the pane, one click away, where a slip is visible). The Board's three "By" buttons and the legend become one Group by menu with an icon and a line per option.
3. **Decisions** (#107). Every proposed action that needs the user, as one line with a Review button, on `/decisions` and as a strip at the top of Today. Review opens the decision sheet: the draft, event, payment or choice the agent proposes, the evidence it rests on, and Approve or Decline, each confirmed in place. The loop page's Approve and Decline pair becomes a Review link to the same sheet.
4. **Welcome and tour** (#108). First visit: three sentences on what Open Loops does and a field to name the agent (`openloops-agent` cookie; the name replaces "Your agent" everywhere). Then a five-stop tour over the real dashboard (`openloops-toured` cookie), skippable and replayable from About.

Out: tiers 2 and 3 of the list (icons per area, swipe actions, motion, texture, appearance settings, About content, Settings, loop page rewrite, activity timeline, calendar agenda, empty states, command bar) are tracked in #109 and follow once these four merge.

## Affected systems

`web/` only. No schema, agent or ledger change. Cookies: `openloops-agent`, `openloops-toured` join `openloops-theme` and `openloops-seen`.

## Approach

- The loop page body moves into `components/loop-detail.tsx` and is rendered by both `/loops/[id]` and the Today pane, so server actions (done, remind, ignore, approve, decline) work identically in both.
- Views become routes; `parseView` and `ViewSwitch` go away. Old `?view=` links redirect.
- The pane is a server component chosen by `searchParams.loop`; the keyboard helper pushes `?loop=` as the focused row changes. No client-side data fetching.
- Decisions are `listActions(user, { status: 'PROPOSED' })` filtered to `requiresApproval || riskTier === 'high'`, joined to their loops. The sheet renders `payload` through `ActionEffect` where the shape matches and as labelled fields otherwise.
- Approve and Decline confirm in place (the button becomes "Confirm approve" for five seconds) rather than through an undo, because approve reaches the runtime and cannot be pulled back.

## Dependencies

None. ADR-0006 covers the framework and hosting.

## Risks

- Time: the video is due Mon Sep 14, 8:00 PM ET. Each PR must leave `main` demoable on its own. Shell first because everything else sits on it.
- Docs drift: `web/README.md`, `docs/hackathon/DEMO.md` (screen directions name "Overview" and the sidebar) and the screenshots describe the old shell. Each PR updates the sentence it makes false; screenshots are recaptured once after PR 4.

## Validation

`pnpm check` and `pnpm --filter @openloop/web build` on every PR. Manual path at 1920, 1280 and 390 wide: open Today, arrow through rows and watch the pane follow, open Board and change Group by, open Decisions and review one action end to end, clear cookies and walk the welcome and tour.

## Unresolved questions

None the team has to decide before building. Whether Done should confirm in place like Approve is decided in PR 3 by using it.
