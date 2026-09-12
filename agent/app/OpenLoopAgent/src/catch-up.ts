import { randomUUID } from 'node:crypto'
import type { AuditEvent, CatchUpSummary, LedgerStore, OpenLoop } from '@openloop/shared'
import type { Specialists } from './agents'

export interface CatchUpDigest {
  since: string
  until: string
  changes: { at: string; loopId: string; title: string; kind: AuditEvent['kind']; reason: string }[]
  needsYou: {
    loopId: string
    title: string
    dueAt?: string
    priority: OpenLoop['priority']
    consequence?: string
  }[]
  deadlinesSoon: { loopId: string; title: string; dueAt: string }[]
  waiting: { loopId: string; title: string; waitingOn?: string }[]
}

const DAY = 86_400_000
const CHANGE_KINDS = new Set<AuditEvent['kind']>([
  'loop_created',
  'state_changed',
  'action_executed',
  'action_failed',
])

/** When the user last asked, or 24 hours ago if never. */
export function lastCheck(audit: AuditEvent[], now: string): string {
  const prev = audit.find((e) => e.kind === 'catch_up')
  return prev?.at ?? new Date(new Date(now).getTime() - DAY).toISOString()
}

/** Pure: everything the summary may mention, computed from ledger records only. */
export function buildDigest(
  loops: OpenLoop[],
  audit: AuditEvent[],
  since: string,
  now: string,
): CatchUpDigest {
  const byId = new Map(loops.map((l) => [l.id, l]))
  const soon = new Date(new Date(now).getTime() + 3 * DAY).toISOString()
  const changes = audit
    .filter((e) => e.at > since && e.at <= now && e.loopId && CHANGE_KINDS.has(e.kind))
    .map((e) => ({
      at: e.at,
      loopId: e.loopId as string,
      title: byId.get(e.loopId as string)?.title ?? 'unknown',
      kind: e.kind,
      reason: e.reason,
    }))
    .sort((a, b) => a.at.localeCompare(b.at))
  const open = loops.filter((l) => l.status !== 'RESOLVED')
  return {
    since,
    until: now,
    changes,
    needsYou: open
      .filter((l) => l.status === 'NEEDS_YOU')
      .map((l) => ({
        loopId: l.id,
        title: l.title,
        priority: l.priority,
        ...(l.dueAt ? { dueAt: l.dueAt } : {}),
        ...(l.consequence ? { consequence: l.consequence } : {}),
      })),
    deadlinesSoon: open
      .filter(
        (l): l is OpenLoop & { dueAt: string } =>
          Boolean(l.dueAt) && (l.dueAt as string) <= soon && (l.dueAt as string) >= now,
      )
      .map((l) => ({ loopId: l.id, title: l.title, dueAt: l.dueAt })),
    waiting: open
      .filter((l) => l.status === 'WAITING')
      .map((l) => ({
        loopId: l.id,
        title: l.title,
        ...(l.waitingOn ? { waitingOn: l.waitingOn } : {}),
      })),
  }
}

/** The catch_up command: digest -> model summary -> audit mark so the next call starts here. */
export async function catchUp(opts: {
  store: LedgerStore
  userId: string
  specialists: Pick<Specialists, 'summarize'>
  now?: string
  since?: string
}): Promise<CatchUpSummary & { since: string; until: string }> {
  const now = opts.now ?? new Date().toISOString()
  const [loops, audit] = await Promise.all([
    opts.store.listLoops(opts.userId),
    opts.store.listAudit(opts.userId, { limit: 500 }),
  ])
  const since = opts.since ?? lastCheck(audit, now)
  const digest = buildDigest(loops, audit, since, now)
  const summary = await opts.specialists.summarize({ digest, now })
  await opts.store.appendAudit({
    id: randomUUID(),
    userId: opts.userId,
    at: now,
    kind: 'catch_up',
    actor: 'user',
    reason: summary.headline.slice(0, 500),
    details: { since, changes: digest.changes.length },
  })
  return { ...summary, since, until: now }
}
