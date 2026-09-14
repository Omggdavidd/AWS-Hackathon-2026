import { z } from 'zod'
import {
  byDateAscending,
  CalendarEvent,
  EmailMessage,
  type IngestionSource,
  type MessageQuery,
  matchesMessageQuery,
} from './source'

const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1'
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3'
const RETRYABLE = new Set([429, 500, 502, 503, 504])
/** Backstop against a server that keeps handing back a page token. */
const MAX_PAGES = 50

/**
 * A short-lived Google access token, or a function that produces one. The web app owns the OAuth
 * flow and passes the token in per invocation (ADR-0011); nothing here reads or stores a refresh
 * token.
 */
export type AccessToken = string | (() => string | Promise<string>)

export interface GoogleSourceOptions {
  accessToken: AccessToken
  /** How far back `listMessages` reaches when the caller gives no `after`. */
  backfillDays?: number
  /** Ceiling on messages fetched in one `listMessages`, so a large inbox cannot run away. */
  maxMessages?: number
  /** Ceiling on events fetched in one `listEvents`. */
  maxEvents?: number
  /** Which calendar `listEvents` reads. */
  calendarId?: string
  /** Bodies are cut to this many characters before a model ever sees them. */
  maxBodyChars?: number
  /** Concurrent `messages.get` calls. Gmail bills 5 quota units each against 250/second/user. */
  concurrency?: number
  /** Retries on 429 and 5xx. */
  maxRetries?: number
  retryBaseMs?: number
  /** Injected in tests so the suite never touches the network. */
  fetchImpl?: typeof fetch
  now?: () => Date
}

/** What we read from a Gmail payload part. Gmail nests parts arbitrarily deep, hence the recursion. */
interface GmailPayload {
  mimeType?: string | undefined
  filename?: string | undefined
  headers?: { name: string; value: string }[] | undefined
  body?: { data?: string | undefined } | undefined
  parts?: GmailPayload[] | undefined
}

const GmailPayloadSchema: z.ZodType<GmailPayload> = z.lazy(() =>
  z.object({
    mimeType: z.string().optional(),
    filename: z.string().optional(),
    headers: z.array(z.object({ name: z.string(), value: z.string().default('') })).optional(),
    body: z.object({ data: z.string().optional() }).optional(),
    parts: z.array(GmailPayloadSchema).optional(),
  }),
)

const GmailMessageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).default([]),
  snippet: z.string().default(''),
  internalDate: z.string().optional(),
  payload: GmailPayloadSchema.optional(),
})
type GmailMessageWire = z.infer<typeof GmailMessageSchema>

const GmailListSchema = z.object({
  messages: z.array(z.object({ id: z.string() })).default([]),
  nextPageToken: z.string().optional(),
})

const GmailThreadSchema = z.object({ messages: z.array(GmailMessageSchema).default([]) })

const CalendarTimeSchema = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
})

const CalendarItemSchema = z.object({
  id: z.string(),
  summary: z.string().default('(no title)'),
  start: CalendarTimeSchema.optional(),
  end: CalendarTimeSchema.optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  attendees: z.array(z.object({ email: z.string().optional() })).default([]),
  status: z.string().default('confirmed'),
  updated: z.string().optional(),
})

const CalendarListSchema = z.object({
  items: z.array(CalendarItemSchema).default([]),
  nextPageToken: z.string().optional(),
})

/**
 * Live Gmail and Google Calendar behind the one `IngestionSource` the fixtures also implement
 * (ADR-0006, ADR-0011), so switching between the seeded demo and a real inbox is configuration.
 *
 * Talks to the REST endpoints over `fetch` rather than through `googleapis`: the shared package
 * carries no framework dependencies, and the three endpoints we need do not justify the install.
 */
export class GoogleSource implements IngestionSource {
  private readonly fetchImpl: typeof fetch
  private readonly backfillDays: number
  private readonly maxMessages: number
  private readonly maxEvents: number
  private readonly calendarId: string
  private readonly maxBodyChars: number
  private readonly concurrency: number
  private readonly maxRetries: number
  private readonly retryBaseMs: number
  private readonly now: () => Date

  constructor(private readonly options: GoogleSourceOptions) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
    this.backfillDays = options.backfillDays ?? 90
    this.maxMessages = options.maxMessages ?? 250
    this.maxEvents = options.maxEvents ?? 250
    this.calendarId = options.calendarId ?? 'primary'
    this.maxBodyChars = options.maxBodyChars ?? 20_000
    this.concurrency = options.concurrency ?? 5
    this.maxRetries = options.maxRetries ?? 3
    this.retryBaseMs = options.retryBaseMs ?? 250
    this.now = options.now ?? (() => new Date())
  }

  async listMessages(query: MessageQuery = {}): Promise<EmailMessage[]> {
    // Gmail has no `q` operator for a thread id, and threads.get is one call instead of a search.
    if (query.threadId !== undefined) {
      const thread = await this.getThread(query.threadId)
      return thread.filter((m) => matchesMessageQuery(m, query))
    }
    const after = query.after ?? this.backfillStart()
    const ids = await this.listMessageIds(gmailQuery({ ...query, after }))
    const messages = await mapPool(ids, this.concurrency, (id) => this.getMessage(id))
    // Gmail's after:/before: are whole-day and text search is fuzzy, so the exact contract in
    // MessageQuery is applied here rather than trusted to the server.
    return messages.filter((m) => matchesMessageQuery(m, { ...query, after })).sort(byDateAscending)
  }

  async getThread(threadId: string): Promise<EmailMessage[]> {
    const raw = await this.request(
      `${GMAIL_BASE}/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
    )
    const thread = GmailThreadSchema.parse(raw)
    return thread.messages.map((m) => this.toEmailMessage(m)).sort(byDateAscending)
  }

  async listEvents(range: { from?: string; to?: string } = {}): Promise<CalendarEvent[]> {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      timeMin: range.from ?? this.backfillStart(),
    })
    if (range.to !== undefined) params.set('timeMax', range.to)
    const events: CalendarEvent[] = []
    let pageToken: string | undefined
    // A page can come back empty and still carry a token; the ceiling below is only reached while
    // events accumulate, so pages are bounded too.
    for (let page = 0; page < MAX_PAGES; page++) {
      if (pageToken) params.set('pageToken', pageToken)
      const raw = await this.request(
        `${CALENDAR_BASE}/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`,
      )
      const parsed = CalendarListSchema.parse(raw)
      for (const item of parsed.items) {
        const event = toCalendarEvent(item)
        // A cancelled instance of a recurring event arrives without start or end; there is nothing
        // to track and the schema requires both.
        if (event) events.push(event)
        if (events.length >= this.maxEvents) return sortEvents(events)
      }
      pageToken = parsed.nextPageToken
      if (!pageToken) break
    }
    return sortEvents(events)
  }

  private backfillStart(): string {
    const from = new Date(this.now().getTime() - this.backfillDays * 86_400_000)
    return from.toISOString()
  }

  private async listMessageIds(q: string): Promise<string[]> {
    const ids: string[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ q, maxResults: '100' })
      if (pageToken) params.set('pageToken', pageToken)
      const raw = await this.request(`${GMAIL_BASE}/users/me/messages?${params}`)
      const parsed = GmailListSchema.parse(raw)
      for (const m of parsed.messages) {
        ids.push(m.id)
        if (ids.length >= this.maxMessages) return ids
      }
      pageToken = parsed.nextPageToken
      if (!pageToken) break
    }
    return ids
  }

  private async getMessage(id: string): Promise<EmailMessage> {
    const raw = await this.request(
      `${GMAIL_BASE}/users/me/messages/${encodeURIComponent(id)}?format=full`,
    )
    return this.toEmailMessage(GmailMessageSchema.parse(raw))
  }

  private toEmailMessage(message: GmailMessageWire): EmailMessage {
    const headers = message.payload?.headers ?? []
    const body = truncate(extractBody(message.payload), this.maxBodyChars)
    const snippet = decodeEntities(message.snippet) || body
    return EmailMessage.parse({
      id: message.id,
      threadId: message.threadId,
      from: headerValue(headers, 'from'),
      to: splitAddresses(headerValue(headers, 'to')),
      subject: headerValue(headers, 'subject'),
      date: messageDate(message, headers),
      snippet: truncate(snippet.replace(/\s+/g, ' ').trim(), 300),
      body,
      labels: message.labelIds,
    })
  }

  private async request(url: string): Promise<unknown> {
    const token =
      typeof this.options.accessToken === 'function'
        ? await this.options.accessToken()
        : this.options.accessToken
    for (let attempt = 0; ; attempt++) {
      const response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      })
      if (response.ok) return response.json()
      if (attempt < this.maxRetries && RETRYABLE.has(response.status)) {
        await sleep(this.retryBaseMs * 2 ** attempt)
        continue
      }
      const detail = await response.text().catch(() => '')
      // The URL carries the search query but never the token, which lives in the header.
      throw new Error(
        `Google API ${response.status} for ${stripQuery(url)}${detail ? `: ${truncate(detail, 300)}` : ''}`,
      )
    }
  }
}

/**
 * Gmail's search syntax for the parts of a MessageQuery it can serve. `after:`/`before:` are
 * whole-day and read in the mailbox's own time zone, so the window is widened by a day at each end
 * and narrowed again in `listMessages`.
 */
export function gmailQuery(query: MessageQuery): string {
  const parts: string[] = []
  if (query.after !== undefined) parts.push(`after:${gmailDate(query.after, -1)}`)
  if (query.before !== undefined) parts.push(`before:${gmailDate(query.before, 1)}`)
  if (query.text !== undefined && query.text.trim() !== '')
    parts.push(`"${query.text.replace(/"/g, '')}"`)
  return parts.join(' ')
}

function gmailDate(iso: string, shiftDays: number): string {
  const at = new Date(Date.parse(iso) + shiftDays * 86_400_000)
  const month = `${at.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${at.getUTCDate()}`.padStart(2, '0')
  return `${at.getUTCFullYear()}/${month}/${day}`
}

function messageDate(
  message: GmailMessageWire,
  headers: { name: string; value: string }[],
): string {
  // internalDate is the delivery time Gmail sorts by, and is milliseconds since the epoch.
  if (message.internalDate !== undefined && message.internalDate !== '') {
    const ms = Number(message.internalDate)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  const header = Date.parse(headerValue(headers, 'date'))
  if (Number.isFinite(header)) return new Date(header).toISOString()
  throw new Error(`Gmail message ${message.id} has no usable date`)
}

/** Prefer text/plain; fall back to stripped HTML, then to a single-part body. */
export function extractBody(payload: GmailPayload | undefined): string {
  if (!payload) return ''
  const parts = flatten(payload).filter((p) => !p.filename)
  const plain = parts.find((p) => p.mimeType?.startsWith('text/plain') && p.body?.data)
  if (plain?.body?.data) return decodeBase64Url(plain.body.data)
  const html = parts.find((p) => p.mimeType?.startsWith('text/html') && p.body?.data)
  if (html?.body?.data) return stripHtml(decodeBase64Url(html.body.data))
  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data)
    return payload.mimeType?.startsWith('text/html') ? stripHtml(decoded) : decoded
  }
  return ''
}

function flatten(payload: GmailPayload): GmailPayload[] {
  return [payload, ...(payload.parts ?? []).flatMap(flatten)]
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8')
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos|nbsp));/gi,
    (match, dec, hex, name) => {
      if (dec || hex) {
        // `String.fromCodePoint` throws above U+10FFFF, and one bad entity in one HTML mail must
        // not abort the scan; leave the entity as written.
        const point = dec ? Number(dec) : Number.parseInt(hex, 16)
        if (!Number.isInteger(point) || point < 0 || point > 0x10ffff) return match
        return String.fromCodePoint(point)
      }
      const named: Record<string, string> = {
        amp: '&',
        lt: '<',
        gt: '>',
        quot: '"',
        apos: "'",
        nbsp: ' ',
      }
      return named[String(name).toLowerCase()] ?? match
    },
  )
}

function headerValue(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name)?.value ?? ''
}

/** `"Last, First" <a@b.c>, d@e.f` is two addresses, not three. */
export function splitAddresses(value: string): string[] {
  const out: string[] = []
  let current = ''
  let quoted = false
  for (const ch of value) {
    if (ch === '"') quoted = !quoted
    if (ch === ',' && !quoted) {
      out.push(current)
      current = ''
    } else current += ch
  }
  out.push(current)
  return out.map((s) => s.trim()).filter(Boolean)
}

function toCalendarEvent(item: z.infer<typeof CalendarItemSchema>): CalendarEvent | undefined {
  const start = calendarTime(item.start)
  const end = calendarTime(item.end)
  if (!start || !end) return undefined
  return CalendarEvent.parse({
    id: item.id,
    title: item.summary,
    start,
    end,
    attendees: item.attendees.flatMap((a) => (a.email ? [a.email] : [])),
    status: ['confirmed', 'tentative', 'cancelled'].includes(item.status)
      ? item.status
      : 'confirmed',
    ...(item.location !== undefined ? { location: item.location } : {}),
    ...(item.description !== undefined ? { description: item.description } : {}),
    ...(item.updated !== undefined ? { updatedAt: new Date(item.updated).toISOString() } : {}),
  })
}

/** All-day events carry `date` instead of `dateTime`; the schema wants an instant either way. */
function calendarTime(
  time: { dateTime?: string | undefined; date?: string | undefined } | undefined,
): string | undefined {
  if (time?.dateTime) return new Date(time.dateTime).toISOString()
  if (time?.date) return `${time.date}T00:00:00Z`
  return undefined
}

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return events.sort((a, b) => a.start.localeCompare(b.start))
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max)
}

function stripQuery(url: string): string {
  const at = url.indexOf('?')
  return at === -1 ? url : url.slice(0, at)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Map with a fixed number of workers, preserving input order. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++
      const item = items[index]
      if (item === undefined) continue
      results[index] = await fn(item)
    }
  })
  await Promise.all(workers)
  return results
}
