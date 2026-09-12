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

/** Urgency at a glance; colors come from the palette tokens in globals.css. */
export function PriorityDot({ priority }: { priority: Priority }) {
  return (
    <span
      role="img"
      className="priority-dot"
      data-priority={priority}
      aria-label={`${priority} priority`}
    />
  )
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
  return (
    <span className="kind-badge" data-kind={kind}>
      {KIND_LABEL[kind]}
    </span>
  )
}
