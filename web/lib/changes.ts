import type { AuditEvent, AuditKind, OpenLoop } from '@openloop/shared'

const WINDOW_MS = 86_400_000

/**
 * What counts as something the user should be told. Evidence, scans and catch-ups are the agent
 * working, not a change in the world; proposals and approvals are already visible as buttons on
 * the loop. SPEC §8H: notify state changes and decisions, never "you have 6 emails".
 */
const NOTABLE: ReadonlySet<AuditKind> = new Set<AuditKind>([
  'state_changed',
  'loop_created',
  'action_executed',
])

/**
 * A run of banner text. Segments carrying a `loopId` are rendered as links to that loop.
 * `key` is stable for a given summary, so the banner never keys React elements by array index.
 */
export type Segment = { key: string; text: string; loopId?: string }

export type ChangeSummary = {
  sentences: Segment[][]
  /**
   * The newest event counted. Dismissal stores this, so the banner comes back when something
   * newer happens rather than staying hidden forever.
   */
  latestAt: string
}

/**
 * One or two sentences describing what changed in the last day, built from the audit trail and the
 * loops' current states rather than from parsing reasons: an event tells us a loop changed, and the
 * loop itself tells us what it became.
 *
 * Returns undefined when nothing notable happened, so the caller renders no banner at all.
 */
export function summarizeChanges(
  audit: AuditEvent[],
  loops: OpenLoop[],
  now: Date,
): ChangeSummary | undefined {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString()
  const recent = audit.filter((event) => event.at >= since && NOTABLE.has(event.kind))
  if (recent.length === 0) return undefined

  const byId = new Map(loops.map((loop) => [loop.id, loop]))
  const touched: string[] = []
  const created = new Set<string>()
  let executed = 0
  for (const event of recent) {
    if (event.kind === 'action_executed') executed += 1
    if (!event.loopId || !byId.has(event.loopId)) continue
    if (event.kind === 'loop_created') created.add(event.loopId)
    if (!touched.includes(event.loopId)) touched.push(event.loopId)
  }

  const closed: OpenLoop[] = []
  const appeared: OpenLoop[] = []
  const needs: OpenLoop[] = []
  for (const id of touched) {
    const loop = byId.get(id)
    if (!loop) continue
    if (loop.status === 'RESOLVED') closed.push(loop)
    else if (created.has(id)) appeared.push(loop)
    else if (loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN') needs.push(loop)
  }

  const sentences: Segment[][] = []
  if (closed.length > 0) {
    sentences.push([
      ...names(closed),
      { key: 'done', text: `${closed.length === 1 ? ' is' : ' are'} done.` },
    ])
  } else if (executed > 0) {
    sentences.push([
      {
        key: 'handled',
        text: `The agent handled ${executed === 1 ? 'one action' : `${executed} actions`}.`,
      },
    ])
  }

  // New arrivals outrank a state change: something you have never seen is the more useful news.
  const second = appeared.length > 0 ? appeared : needs
  if (second.length > 0) {
    const one = second.length === 1
    const tail =
      appeared.length > 0 ? (one ? ' is new.' : ' are new.') : one ? ' needs you.' : ' need you.'
    sentences.push([...names(second), { key: 'tail', text: tail }])
  }

  if (sentences.length === 0) return undefined
  return {
    sentences,
    latestAt: recent.reduce((max, event) => (event.at > max ? event.at : max), ''),
  }
}

/** "X", "X and Y", "X, Y and 3 more" — each named loop links to itself. */
function names(loops: OpenLoop[]): Segment[] {
  const shown = loops.slice(0, 2)
  const rest = loops.length - shown.length
  const segments: Segment[] = []
  shown.forEach((loop, index) => {
    if (index > 0) segments.push({ key: `sep-${loop.id}`, text: rest > 0 ? ', ' : ' and ' })
    segments.push({ key: `loop-${loop.id}`, text: loop.title, loopId: loop.id })
  })
  if (rest > 0) segments.push({ key: 'more', text: ` and ${rest} more` })
  return segments
}
