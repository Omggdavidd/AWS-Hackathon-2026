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
 * Effects that always wait for a person, whatever tier the Risk Judge assigned (SPEC §12). The tier
 * is model output, so it cannot be the only thing standing in front of mail leaving the account or
 * money moving: a `pay` rated `low` would otherwise run unattended. `other` is here because an effect
 * nothing recognises is exactly the one not to carry out on a guess.
 */
const NEVER_AUTOMATIC: ProposedActionType[] = [
  'send_email',
  'pay',
  'submit_form',
  'other',
  // ADR-0005 puts "book a paid service" under High and "suggest slots" under Medium. The type
  // says book, so it is the booking (#173). Proposing a time is what the demo's dentist action
  // actually does, and that is a `remind` or a draft, not this.
  'book_appointment',
]

/** Effects a sink can carry out without a person: everything except sending mail or paying (SPEC §12). */
export function isAutoExecutable(action: ProposedAction): boolean {
  if (NEVER_AUTOMATIC.includes(action.type)) return false
  if (action.riskTier === 'high') return false
  if (action.riskTier === 'low') return true
  return ['draft_email', 'create_calendar_event', 'remind', 'follow_up'].includes(action.type)
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
