import type { ActionPlan, ActionResult, ProposedAction } from '../schemas/index'
import type { ActionSink } from './sink'

/**
 * Simulated effects for the seeded demo (ADR-0006). Nothing leaves the process; the result carries a
 * synthetic source ref so the ledger can record what "happened" as evidence.
 */
export class FixtureActionSink implements ActionSink {
  readonly log: { action: ProposedAction; plan: ActionPlan }[] = []

  async execute(action: ProposedAction, plan: ActionPlan): Promise<ActionResult> {
    this.log.push({ action, plan })
    const e = plan.effect
    const summary =
      e.kind === 'draft_email'
        ? `Draft ready to ${e.to}: "${e.subject}"`
        : e.kind === 'send_email'
          ? `Sent to ${e.to}: "${e.subject}"`
          : e.kind === 'calendar_event'
            ? `${e.eventId ? 'Updated' : 'Created'} calendar event "${e.title}" at ${e.start}${e.location ? `, ${e.location}` : ''}`
            : e.kind === 'reminder'
              ? `Reminder set for ${e.at}: ${e.note}`
              : e.kind === 'archive_thread'
                ? `Archived thread ${e.threadId}`
                : e.text
    return {
      success: true,
      summary: summary.slice(0, 300),
      resultSourceRef: { sourceType: 'agent', sourceId: `action:${action.id}` },
    }
  }
}
