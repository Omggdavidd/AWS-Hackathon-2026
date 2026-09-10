import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { CalendarEvent, EmailMessage, type IngestionSource, type MessageQuery } from './source'

const FixtureFile = z.object({
  persona: z.object({ name: z.string(), email: z.string(), now: z.string() }),
  messages: z.array(EmailMessage),
  events: z.array(CalendarEvent),
})
export type FixtureFile = z.infer<typeof FixtureFile>

/** Seeded inbox and calendar for the deterministic demo (SPEC §14). */
export class FixtureSource implements IngestionSource {
  private constructor(readonly fixture: FixtureFile) {}

  static async load(filePath: string): Promise<FixtureSource> {
    const raw = JSON.parse(await readFile(filePath, 'utf8'))
    return new FixtureSource(FixtureFile.parse(raw))
  }

  static fromData(data: unknown): FixtureSource {
    return new FixtureSource(FixtureFile.parse(data))
  }

  async listMessages(query: MessageQuery = {}): Promise<EmailMessage[]> {
    const text = query.text?.toLowerCase()
    return this.fixture.messages
      .filter(
        (m) =>
          (query.after === undefined || m.date >= query.after) &&
          (query.before === undefined || m.date <= query.before) &&
          (query.threadId === undefined || m.threadId === query.threadId) &&
          (text === undefined || `${m.subject} ${m.from} ${m.body}`.toLowerCase().includes(text)),
      )
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  async getThread(threadId: string): Promise<EmailMessage[]> {
    return this.listMessages({ threadId })
  }

  async listEvents(range: { from?: string; to?: string } = {}): Promise<CalendarEvent[]> {
    return this.fixture.events
      .filter(
        (e) =>
          (range.from === undefined || e.end >= range.from) &&
          (range.to === undefined || e.start <= range.to),
      )
      .sort((a, b) => a.start.localeCompare(b.start))
  }
}
