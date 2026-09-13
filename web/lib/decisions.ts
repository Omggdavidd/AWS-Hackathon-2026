import type { LedgerStore, OpenLoop, ProposedAction } from '@openloop/shared'

export type Decision = { action: ProposedAction; loop: OpenLoop | undefined }

/** An action the agent will not take on its own: proposed, and either gated or high risk (ADR-0005). */
export function needsDecision(action: ProposedAction): boolean {
  return action.status === 'PROPOSED' && (action.requiresApproval || action.riskTier === 'high')
}

/**
 * Everything waiting on the user, newest proposal first, each joined to its loop so a line can say
 * what it is about. Loops are passed in when the caller already has them, to avoid a second read.
 */
export async function pendingDecisions(
  store: LedgerStore,
  userId: string,
  loops?: OpenLoop[],
): Promise<Decision[]> {
  const actions = (await store.listActions(userId, { status: 'PROPOSED' })).filter(needsDecision)
  if (actions.length === 0) return []
  const all = loops ?? (await store.listLoops(userId))
  const byId = new Map(all.map((loop) => [loop.id, loop]))
  return actions
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((action) => ({ action, loop: byId.get(action.loopId) }))
}

export type Proposal =
  | { kind: 'email'; to: string; subject: string; body: string }
  | { kind: 'payment'; amount?: string; portal?: string }
  | { kind: 'choice'; options: string[]; free: string[] }
  | { kind: 'fields'; fields: { label: string; value: string }[] }

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
const list = (v: unknown): string[] | undefined =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : undefined

/**
 * What the agent is asking permission for, in the shape it will take: the email it would send,
 * the payment it would make, the slots it would choose between. Anything it does not recognise is
 * shown as labelled fields rather than hidden, because a person should see everything they
 * authorise (SPEC §8B).
 */
export function describeProposal(action: ProposedAction): Proposal | undefined {
  const p = action.payload
  if (action.type === 'draft_email' || action.type === 'send_email') {
    const to = str(p.to)
    const subject = str(p.subject)
    const body = str(p.body)
    if (to && subject && body) return { kind: 'email', to, subject, body }
  }
  if (action.type === 'pay') {
    const value = typeof p.amount === 'number' ? p.amount : undefined
    const currency = str(p.currency) ?? 'USD'
    const amount =
      value === undefined
        ? undefined
        : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
    return { kind: 'payment', amount, portal: str(p.portal) }
  }
  if (action.type === 'book_appointment') {
    const options = list(p.candidates)
    if (options) return { kind: 'choice', options, free: list(p.conflictFree) ?? [] }
  }
  const fields = Object.entries(p)
    .filter(([key]) => key !== 'effect')
    .map(([key, value]) => ({
      label: key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }))
  return fields.length > 0 ? { kind: 'fields', fields } : undefined
}
