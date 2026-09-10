import { z } from 'zod'

export const Id = z.string().min(1)
export const IsoDateTime = z.iso.datetime({ offset: true })
export const Confidence = z.number().min(0).max(1)

export const LoopStatus = z.enum(['NEEDS_YOU', 'WAITING', 'WATCHING', 'RESOLVED', 'UNCERTAIN'])
export type LoopStatus = z.infer<typeof LoopStatus>

export const RiskTier = z.enum(['low', 'medium', 'high'])
export type RiskTier = z.infer<typeof RiskTier>

export const Priority = z.enum(['critical', 'high', 'medium', 'low'])
export type Priority = z.infer<typeof Priority>

export const SourceType = z.enum(['email', 'calendar', 'user', 'agent'])
export type SourceType = z.infer<typeof SourceType>

/** Pointer back to the original message or event. Full bodies are never stored on the loop. */
export const SourceRef = z.object({
  sourceType: SourceType,
  sourceId: Id,
  threadId: Id.optional(),
})
export type SourceRef = z.infer<typeof SourceRef>

export const Money = z.object({
  value: z.number(),
  currency: z.string().length(3).default('USD'),
})
export type Money = z.infer<typeof Money>
