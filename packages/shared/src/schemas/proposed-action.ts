import { z } from 'zod'
import { Id, IsoDateTime, RiskTier } from './common'

export const ProposedActionType = z.enum([
  'draft_email',
  'send_email',
  'create_calendar_event',
  'follow_up',
  'archive_thread',
  'remind',
  'book_appointment',
  'pay',
  'submit_form',
  'other',
])
export type ProposedActionType = z.infer<typeof ProposedActionType>

export const ProposedActionStatus = z.enum([
  'PROPOSED',
  'APPROVED',
  'EXECUTED',
  'FAILED',
  'CANCELLED',
])
export type ProposedActionStatus = z.infer<typeof ProposedActionStatus>

/** Something the agent wants to do. High-risk actions execute only when status is APPROVED (ADR-0005). */
export const ProposedAction = z.object({
  id: Id,
  loopId: Id,
  userId: Id,
  type: ProposedActionType,
  riskTier: RiskTier,
  requiresApproval: z.boolean(),
  summary: z.string().max(200),
  payload: z.record(z.string(), z.unknown()).default({}),
  status: ProposedActionStatus,
  createdAt: IsoDateTime,
  executedAt: IsoDateTime.optional(),
  resultEvidenceId: Id.optional(),
  error: z.string().max(500).optional(),
})
export type ProposedAction = z.infer<typeof ProposedAction>
