import { z } from 'zod'
import {
  Confidence,
  Id,
  IsoDateTime,
  LoopStatus,
  Money,
  Priority,
  RiskTier,
  SourceRef,
} from './common'

export const LoopCategory = z.enum([
  'payment',
  'reply',
  'form',
  'appointment',
  'travel',
  'purchase',
  'subscription',
  'meeting',
  'admin',
  'other',
])
export type LoopCategory = z.infer<typeof LoopCategory>

export const ActionType = z.enum([
  'pay',
  'reply',
  'submit',
  'sign',
  'choose',
  'review',
  'confirm',
  'attend',
  'book',
  'return',
  'none',
])
export type ActionType = z.infer<typeof ActionType>

/** A responsibility that stays alive until evidence or the user closes it (SPEC §11). */
export const OpenLoop = z.object({
  id: Id,
  userId: Id,
  title: z.string().min(1).max(120),
  category: LoopCategory,
  status: LoopStatus,
  requestedBy: z.string().optional(),
  owner: z.enum(['user', 'other', 'nobody']).default('user'),
  actionType: ActionType.default('none'),
  dueAt: IsoDateTime.optional(),
  amount: Money.optional(),
  consequence: z.string().max(200).optional(),
  riskLevel: RiskTier.default('low'),
  priority: Priority.default('medium'),
  confidence: Confidence,
  nextAction: z.string().max(200).optional(),
  waitingOn: z.string().max(120).optional(),
  sourceRefs: z.array(SourceRef).min(1),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  resolvedAt: IsoDateTime.optional(),
})
export type OpenLoop = z.infer<typeof OpenLoop>
export type OpenLoopInput = z.input<typeof OpenLoop>
