import type { InvestigatorOutput } from './agent-outputs'
import { AuditEvent, type AuditKind } from './audit-event'
import { Evidence } from './evidence'

export interface AuditEventDraft {
  id: string
  userId: string
  loopId?: string | undefined
  actionId?: string | undefined
  at: string
  kind: AuditKind
  actor: AuditEvent['actor']
  reason: string
  details?: Record<string, unknown> | undefined
}

/**
 * The one way to write an audit row (SPEC §12). Reasons come from a model, so they are cut to the
 * 500 the schema allows rather than thrown away, and the row is parsed before it crosses a package
 * boundary.
 */
export function auditEvent(draft: AuditEventDraft): AuditEvent {
  return AuditEvent.parse({
    id: draft.id,
    userId: draft.userId,
    ...(draft.loopId ? { loopId: draft.loopId } : {}),
    ...(draft.actionId ? { actionId: draft.actionId } : {}),
    at: draft.at,
    kind: draft.kind,
    actor: draft.actor,
    reason: draft.reason.slice(0, 500),
    ...(draft.details ? { details: draft.details } : {}),
  })
}

/**
 * One Investigator observation as a stored evidence row: model output nests the source in a
 * `sourceRef`, a stored record spreads those fields across the row (ADR-0003).
 */
export function evidenceFromInvestigator(
  id: string,
  loopId: string,
  item: InvestigatorOutput['evidence'][number],
): Evidence {
  return Evidence.parse({
    id,
    loopId,
    sourceType: item.sourceRef.sourceType,
    sourceId: item.sourceRef.sourceId,
    ...(item.sourceRef.threadId ? { threadId: item.sourceRef.threadId } : {}),
    observedAt: item.observedAt,
    excerpt: item.excerpt,
    supports: item.supports,
    confidence: item.confidence,
  })
}
