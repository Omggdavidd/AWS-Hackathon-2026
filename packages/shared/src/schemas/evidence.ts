import { z } from 'zod'
import { Confidence, Id, IsoDateTime, SourceType } from './common'

export const EvidenceSupports = z.enum(['OPEN', 'RESOLVED', 'UPDATED', 'CONTRADICTS'])
export type EvidenceSupports = z.infer<typeof EvidenceSupports>

/** A source observation attached to a loop. Excerpts are short; the source id is the truth. */
export const Evidence = z.object({
  id: Id,
  loopId: Id,
  sourceType: SourceType,
  sourceId: Id,
  threadId: Id.optional(),
  observedAt: IsoDateTime,
  excerpt: z.string().max(500),
  supports: EvidenceSupports,
  confidence: Confidence,
})
export type Evidence = z.infer<typeof Evidence>
