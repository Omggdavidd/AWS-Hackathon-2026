import type { LoopStatus, Priority } from '@openloop/shared'
import { STATUS_LABEL } from '@/lib/format'

const STATUS_STYLE: Record<LoopStatus, string> = {
  NEEDS_YOU:
    'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-900',
  WAITING:
    'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
  WATCHING:
    'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900',
  RESOLVED:
    'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
  UNCERTAIN:
    'bg-stone-100 text-stone-700 ring-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700',
}

export function StatusChip({ status }: { status: LoopStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}
    >
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
      className={`inline-block size-2 rounded-full ${PRIORITY_DOT[priority]}`}
      aria-label={`${priority} priority`}
    />
  )
}
