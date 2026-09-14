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

/**
 * The part of life a responsibility belongs to, the way people sort their own to-do lists.
 * Category says what kind of admin it is; area says whose world it lives in. The Extractor sets it;
 * records written before it existed default to "other".
 */
export const LoopArea = z.enum([
  'school',
  'work',
  'money',
  'health',
  'home',
  'travel',
  'community',
  'other',
])
export type LoopArea = z.infer<typeof LoopArea>

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
export const OpenLoop = z
  .object({
    id: Id,
    userId: Id,
    title: z.string().min(1).max(120),
    category: LoopCategory,
    area: LoopArea.default('other'),
    status: LoopStatus,
    requestedBy: z.string().optional(),
    owner: z.enum(['user', 'other', 'nobody']).default('user'),
    actionType: ActionType.default('none'),
    dueAt: IsoDateTime.optional(),
    amount: Money.optional(),
    consequence: z.string().max(200).optional(),
    riskLevel: RiskTier.default('low'),
    priority: Priority.default('medium'),
    /**
     * Whether this loop is worth interrupting the user for, as opposed to waiting to be found. The
     * Risk Judge decides it per loop (SPEC 1: interrupt only when a real decision is required); the
     * web app gates the browser notification on it. Records written before it existed default to
     * false, so an old loop can never tap someone on the shoulder retroactively.
     */
    interruptUser: z.boolean().default(false),
    confidence: Confidence,
    nextAction: z.string().max(200).optional(),
    waitingOn: z.string().max(120).optional(),
    sourceRefs: z.array(SourceRef).min(1),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
    resolvedAt: IsoDateTime.optional(),
    /** When the user asked to be reminded again, after parking the loop in Watching (SPEC 8B). */
    remindAt: IsoDateTime.optional(),
    /**
     * Optimistic-concurrency counter, bumped only by a compare-and-swap write (ADR-0014). Optional
     * rather than defaulted: every record written before it existed, and every blind `putLoop`,
     * leaves it absent, and the stores read absent as 0.
     */
    version: z.number().int().nonnegative().optional(),
  })
  // A closed loop says when it closed: `applyTransition` stamps it, so a RESOLVED row without it
  // was written around the lifecycle (SPEC 7).
  .refine((l) => l.status !== 'RESOLVED' || l.resolvedAt !== undefined, {
    message: 'a RESOLVED loop must carry resolvedAt',
    path: ['resolvedAt'],
  })
  .refine(
    (l) => l.resolvedAt === undefined || Date.parse(l.resolvedAt) >= Date.parse(l.createdAt),
    {
      message: 'resolvedAt cannot precede createdAt',
      path: ['resolvedAt'],
    },
  )
export type OpenLoop = z.infer<typeof OpenLoop>
export type OpenLoopInput = z.input<typeof OpenLoop>
