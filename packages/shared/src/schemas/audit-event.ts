import { z } from 'zod'
import { Id, IsoDateTime } from './common.js'

export const AuditKind = z.enum([
  'loop_created',
  'state_changed',
  'evidence_added',
  'action_proposed',
  'action_approved',
  'action_executed',
  'action_failed',
  'action_cancelled',
  'notification',
  'scan_completed',
])
export type AuditKind = z.infer<typeof AuditKind>

/** Every state change and action gets a timestamped reason (SPEC §12). This is the activity feed. */
export const AuditEvent = z.object({
  id: Id,
  userId: Id,
  loopId: Id.optional(),
  actionId: Id.optional(),
  at: IsoDateTime,
  kind: AuditKind,
  actor: z.enum(['agent', 'user', 'system']),
  reason: z.string().max(500),
  details: z.record(z.string(), z.unknown()).optional(),
})
export type AuditEvent = z.infer<typeof AuditEvent>
