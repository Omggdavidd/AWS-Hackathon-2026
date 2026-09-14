import type { ActionPlan, ActionResult, ProposedAction, ProposedActionType } from '../schemas/index'

/**
 * Where effects happen (ADR-0005). The fixture sink simulates them for the deterministic demo; Gmail and
 * Calendar sinks are the live path. Sinks never decide policy: the orchestrator checks tier and approval
 * before calling execute.
 */
export interface ActionSink {
  execute(action: ProposedAction, plan: ActionPlan): Promise<ActionResult>
}

/**
 * Effects no tier makes safe: they move money, commit the user to someone else, or speak in their
 * name, and none of them can be taken back. `riskTier` is a field the Risk Judge writes and
 * `requiresApproval` is derived from it, so without this list one model field decides whether a
 * payment leaves the account. This one asks the model nothing.
 */
const NEVER_AUTOMATIC: ReadonlySet<ProposedActionType> = new Set([
  'pay',
  'submit_form',
  'send_email',
  'book_appointment',
  'other',
])

/** Preparing is not acting: what a medium-risk action may still do alone. */
const MEDIUM_OK: ReadonlySet<ProposedActionType> = new Set([
  'draft_email',
  'create_calendar_event',
  'remind',
  'follow_up',
])

/** Effects a sink can carry out without a person (SPEC §12). The type is checked at every tier. */
export function isAutoExecutable(action: ProposedAction): boolean {
  if (NEVER_AUTOMATIC.has(action.type)) return false
  if (action.riskTier === 'high') return false
  if (action.riskTier === 'low') return true
  return MEDIUM_OK.has(action.type)
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
