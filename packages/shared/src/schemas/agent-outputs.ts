import { z } from 'zod'
import { Confidence, IsoDateTime, LoopStatus, Money, Priority, RiskTier, SourceRef } from './common'
import { EvidenceSupports } from './evidence'
import { ActionType, LoopCategory } from './open-loop'
import { ProposedActionType } from './proposed-action'

/** Extractor: does this message or event create or modify a responsibility? (ADR-0003) */
export const ExtractorOutput = z.object({
  isResponsibility: z.boolean(),
  candidate: z
    .object({
      title: z.string().max(120),
      category: LoopCategory,
      actionType: ActionType,
      requestedBy: z.string().optional(),
      dueAt: IsoDateTime.optional(),
      amount: Money.optional(),
      consequence: z.string().max(200).optional(),
      sourceRef: SourceRef,
    })
    .optional(),
  confidence: Confidence,
  rationale: z.string().max(300),
})
export type ExtractorOutput = z.infer<typeof ExtractorOutput>

/** Investigator: evidence bundle and proposed state after searching related sources. */
export const InvestigatorOutput = z.object({
  evidence: z.array(
    z.object({
      sourceRef: SourceRef,
      observedAt: IsoDateTime,
      excerpt: z.string().max(500),
      supports: EvidenceSupports,
      confidence: Confidence,
    }),
  ),
  proposedStatus: LoopStatus,
  waitingOn: z.string().max(120).optional(),
  confidence: Confidence,
  rationale: z.string().max(300),
})
export type InvestigatorOutput = z.infer<typeof InvestigatorOutput>

/** Risk Judge: consequence, urgency, whether approval is required, recommended next action. */
export const RiskJudgment = z.object({
  riskTier: RiskTier,
  priority: Priority,
  consequence: z.string().max(200),
  nextAction: z.string().max(200),
  proposedActions: z
    .array(
      z.object({
        type: ProposedActionType,
        summary: z.string().max(200),
        riskTier: RiskTier,
        payload: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
  interruptUser: z.boolean(),
  rationale: z.string().max(300),
})
export type RiskJudgment = z.infer<typeof RiskJudgment>

/** Action Agent: what happened when an approved or low-risk action ran. */
export const ActionResult = z.object({
  success: z.boolean(),
  summary: z.string().max(300),
  resultSourceRef: SourceRef.optional(),
  error: z.string().max(500).optional(),
})
export type ActionResult = z.infer<typeof ActionResult>
