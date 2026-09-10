import { z } from 'zod'
import { Id, IsoDateTime } from '../schemas/common'

/** Minimal email shape shared by the Gmail connector and the fixtures. Bodies are plain text. */
export const EmailMessage = z.object({
  id: Id,
  threadId: Id,
  from: z.string(),
  to: z.array(z.string()).default([]),
  subject: z.string(),
  date: IsoDateTime,
  snippet: z.string().max(300),
  body: z.string(),
  labels: z.array(z.string()).default([]),
})
export type EmailMessage = z.infer<typeof EmailMessage>

export const CalendarEvent = z.object({
  id: Id,
  title: z.string(),
  start: IsoDateTime,
  end: IsoDateTime,
  location: z.string().optional(),
  description: z.string().optional(),
  attendees: z.array(z.string()).default([]),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).default('confirmed'),
  updatedAt: IsoDateTime.optional(),
})
export type CalendarEvent = z.infer<typeof CalendarEvent>

export interface MessageQuery {
  after?: string
  before?: string
  /** Free-text filter applied to subject, from and body. Gmail maps it to its search syntax. */
  text?: string
  threadId?: string
}

/**
 * One interface for fixtures and live Gmail/Calendar (ADR-0006, ADR-0011). Switching between them
 * is configuration. Results are sorted oldest first so ingestion is deterministic.
 */
export interface IngestionSource {
  listMessages(query?: MessageQuery): Promise<EmailMessage[]>
  getThread(threadId: string): Promise<EmailMessage[]>
  listEvents(range?: { from?: string; to?: string }): Promise<CalendarEvent[]>
}
