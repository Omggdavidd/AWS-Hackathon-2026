import { ActionPlan, type AuditEvent, type ProposedAction } from '@openloop/shared'

export type Effect = ActionPlan['effect']

/** The concrete effect stored by executeAction in `payload.effect`, or undefined for anything else. */
export function parseEffect(action: ProposedAction): Effect | undefined {
  const raw = action.payload.effect
  if (raw === undefined) return undefined
  const parsed = ActionPlan.shape.effect.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

/** Why a cancelled or failed action ended that way, from the newest matching audit event. */
export function terminalReason(action: ProposedAction, audit: AuditEvent[]): string | undefined {
  if (action.status !== 'CANCELLED' && action.status !== 'FAILED') return undefined
  const kind = action.status === 'CANCELLED' ? 'action_cancelled' : 'action_failed'
  const hit = audit.find((e) => e.actionId === action.id && e.kind === kind)
  return hit?.reason ?? action.error
}

export const STATUS_TEXT: Record<ProposedAction['status'], string> = {
  PROPOSED: 'Proposed',
  APPROVED: 'Approved, running',
  EXECUTED: 'Done',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
}
