import type { ActionPlan, ActionResult, ProposedAction } from '../schemas/index'

/**
 * Where effects happen (ADR-0005). The fixture sink simulates them for the deterministic demo; Gmail and
 * Calendar sinks are the live path. Sinks never decide policy: the orchestrator checks tier and approval
 * before calling execute.
 */
export interface ActionSink {
  execute(action: ProposedAction, plan: ActionPlan): Promise<ActionResult>
}

/** Effects a sink can carry out without a person: everything except sending mail or paying (SPEC §12). */
export function isAutoExecutable(action: ProposedAction): boolean {
  if (action.riskTier === 'high') return false
  if (action.riskTier === 'low') return true
  return [
    'draft_email',
    'create_calendar_event',
    'remind',
    'follow_up',
    'book_appointment',
  ].includes(action.type)
}

/** Policy gate applied by the orchestrator before any effect runs. */
export function mayExecute(action: ProposedAction): { ok: true } | { ok: false; reason: string } {
  if (action.status === 'EXECUTED') return { ok: false, reason: 'already executed' }
  if (action.status === 'CANCELLED' || action.status === 'FAILED')
    return { ok: false, reason: `action is ${action.status.toLowerCase()}` }
  if (action.status === 'APPROVED') return { ok: true }
  if (action.requiresApproval || action.riskTier === 'high')
    return { ok: false, reason: 'requires your approval' }
  if (!isAutoExecutable(action)) return { ok: false, reason: 'requires your approval' }
  return { ok: true }
}
