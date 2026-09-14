import type { AuditEvent, OpenLoop, ProposedAction, ProposedActionStatus } from '../schemas/index'
import type { LoopFilter } from './store'

/**
 * The filter and order every LedgerStore owes its callers, in one place. Both implementations read
 * a partition and then apply these, so `LocalLedgerStore` and `DynamoLedgerStore` cannot drift
 * apart on what a query means; the shared contract suite pins the behaviour.
 */

/** A missing dueAt sorts after every real date, so undated loops land at the end of the list. */
const NO_DUE_DATE = '9999'

export function matchesLoopFilter(loop: OpenLoop, filter: LoopFilter = {}): boolean {
  if (filter.status === undefined) return true
  return [filter.status].flat().includes(loop.status)
}

/** Soonest due first, undated last, ties broken by creation time. */
export function compareLoopsByDue(a: OpenLoop, b: OpenLoop): number {
  return (
    (a.dueAt ?? NO_DUE_DATE).localeCompare(b.dueAt ?? NO_DUE_DATE) ||
    a.createdAt.localeCompare(b.createdAt)
  )
}

export type ActionFilter = { loopId?: string; status?: ProposedActionStatus }

export function matchesActionFilter(action: ProposedAction, filter: ActionFilter = {}): boolean {
  return (
    (filter.loopId === undefined || action.loopId === filter.loopId) &&
    (filter.status === undefined || action.status === filter.status)
  )
}

export function compareActionsByCreated(a: ProposedAction, b: ProposedAction): number {
  return a.createdAt.localeCompare(b.createdAt)
}

export type AuditFilter = { loopId?: string; limit?: number }

export function matchesAuditFilter(event: AuditEvent, opts: AuditFilter = {}): boolean {
  return opts.loopId === undefined || event.loopId === opts.loopId
}

export function compareAuditNewestFirst(a: AuditEvent, b: AuditEvent): number {
  return b.at.localeCompare(a.at)
}

export function compareEvidenceByObserved(
  a: { observedAt: string },
  b: { observedAt: string },
): number {
  return a.observedAt.localeCompare(b.observedAt)
}
