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

/**
 * The filter every `IngestionSource` applies, so fixtures and live Gmail agree on what a query
 * means. Timestamps are compared as instants rather than strings: Gmail returns UTC while the
 * fixtures are written with a local offset, and `'...Z' >= '...-04:00'` is true as text for an
 * instant that is actually earlier.
 */
export function matchesMessageQuery(message: EmailMessage, query: MessageQuery = {}): boolean {
  const at = Date.parse(message.date)
  const text = query.text?.toLowerCase()
  return (
    (query.after === undefined || at >= Date.parse(query.after)) &&
    (query.before === undefined || at <= Date.parse(query.before)) &&
    (query.threadId === undefined || message.threadId === query.threadId) &&
    (text === undefined ||
      `${message.subject} ${message.from} ${message.body}`.toLowerCase().includes(text))
  )
}

/** Oldest first, the order the `IngestionSource` contract promises. */
export function byDateAscending(a: EmailMessage, b: EmailMessage): number {
  return Date.parse(a.date) - Date.parse(b.date)
}
