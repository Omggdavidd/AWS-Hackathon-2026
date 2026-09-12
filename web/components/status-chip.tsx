import type { AuditKind, LoopStatus, Priority } from '@openloop/shared'
import { STATUS_LABEL } from '@/lib/format'

const STATUS_TONE: Record<LoopStatus, string> = {
  NEEDS_YOU: 'needs-you',
  WAITING: 'waiting',
  WATCHING: 'watching',
  RESOLVED: 'resolved',
  UNCERTAIN: 'uncertain',
}

export function StatusChip({ status }: { status: LoopStatus }) {
  return (
    <span className="status-chip" data-state={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </span>
  )
}

const PRIORITY_DOT: Record<Priority, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-stone-400',
}

export function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span
      role="img"
      className={`inline-block h-2 w-2 shrink-0 self-center rounded-full ${PRIORITY_DOT[priority]}`}
      aria-label={`${priority} priority`}
    />
  )
}

const KIND_STYLE: Partial<Record<AuditKind, string>> = {
  loop_created:
    'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900',
  state_changed:
    'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900',
  action_executed:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
  action_failed:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
  action_cancelled:
    'bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700',
}

const KIND_LABEL: Record<AuditKind, string> = {
  loop_created: 'New loop',
  state_changed: 'State changed',
  evidence_added: 'Evidence',
  action_proposed: 'Proposed',
  action_approved: 'Approved',
  action_executed: 'Done',
  action_failed: 'Failed',
  action_cancelled: 'Cancelled',
  notification: 'Notified',
  scan_completed: 'Scan',
  catch_up: 'Catch-up',
}

/** Same chip language as loop statuses, for the activity feed. */
export function KindBadge({ kind }: { kind: AuditKind }) {
  const style =
    KIND_STYLE[kind] ??
    'bg-stone-100 text-stone-600 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700'
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      {KIND_LABEL[kind]}
    </span>
  )
}
