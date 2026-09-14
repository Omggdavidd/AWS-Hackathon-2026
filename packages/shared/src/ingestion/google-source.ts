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

/**
 * What a listing lost, and why. `IngestionSource` hands back bare arrays, so a caller reading only
 * the array cannot tell a quiet inbox from one that was cut short; these travel out of band through
 * `onEvent` and `stats` rather than changing the interface the fixtures also implement.
 */
export type GoogleSourceEvent =
  | { type: 'message_skipped'; id: string; reason: string }
  | {
      type: 'truncated'
      kind: 'messages' | 'events'
      limit: number
      /** The window actually covered, which is narrower than the one asked for. */
      covered: { from: string; to: string }
    }

export interface GoogleSourceStats {
  /** Messages fetched but unusable: a payload that did not parse, or no date to place them by. */
  skippedMessages: number
  /** A ceiling ended a listing early, so what came back is a slice of the window asked for. */
  truncatedMessages: boolean
  truncatedEvents: boolean
}

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
  /** Ceiling on one wait between tries, including a `Retry-After` the server asks for. */
  retryMaxMs?: number
  /** Give up on one request after this long, so a hung connection cannot eat the scan budget. */
  requestTimeoutMs?: number
  /** What a listing skipped or truncated, as it happens. Defaults to silence. */
  onEvent?: (event: GoogleSourceEvent) => void
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

/** Messages stay `unknown` here so one unreadable message cannot cost the rest of the thread. */
const GmailThreadSchema = z.object({ messages: z.array(z.unknown()).default([]) })

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

/** One try at a request, with the body already read so the timeout covers reading it too. */
type Attempt =
  | { ok: true; body: unknown }
  | { ok: false; status: number; retryAfter: string | null; detail: string }

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
  private readonly retryMaxMs: number
  private readonly requestTimeoutMs: number
  private readonly onEvent: (event: GoogleSourceEvent) => void
  private readonly now: () => Date
  private readonly counts: GoogleSourceStats = {
    skippedMessages: 0,
    truncatedMessages: false,
    truncatedEvents: false,
  }

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
    this.retryMaxMs = options.retryMaxMs ?? 30_000
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000
    this.onEvent = options.onEvent ?? (() => {})
    this.now = options.now ?? (() => new Date())
  }

  /** What every listing on this instance has skipped or cut short so far. */
  get stats(): GoogleSourceStats {
    return { ...this.counts }
  }

  async listMessages(query: MessageQuery = {}): Promise<EmailMessage[]> {
    // Gmail has no `q` operator for a thread id, and threads.get is one call instead of a search.
    if (query.threadId !== undefined) {
      const thread = await this.getThread(query.threadId)
      return thread.filter((m) => matchesMessageQuery(m, query))
    }
    const after = query.after ?? this.backfillStart()
    const { ids, truncated } = await this.listMessageIds(gmailQuery({ ...query, after }))
    const fetched = await mapPool(ids, this.concurrency, (id) => this.getMessage(id))
    // Gmail's after:/before: are whole-day and text search is fuzzy, so the exact contract in
    // MessageQuery is applied here rather than trusted to the server.
    const messages = fetched
      .filter((m): m is EmailMessage => m !== undefined)
      .filter((m) => matchesMessageQuery(m, { ...query, after }))
      .sort(byDateAscending)
    if (truncated) {
      this.counts.truncatedMessages = true
      this.onEvent({
        type: 'truncated',
        kind: 'messages',
        limit: this.maxMessages,
        covered: { from: messages[0]?.date ?? after, to: messages.at(-1)?.date ?? after },
      })
    }
    return messages
  }

  async getThread(threadId: string): Promise<EmailMessage[]> {
    const raw = await this.request(
      `${GMAIL_BASE}/users/me/threads/${encodeURIComponent(threadId)}?format=full`,
    )
    const thread = GmailThreadSchema.parse(raw)
    return thread.messages
      .map((m, index) => this.toEmailMessage(m, `${threadId}[${index}]`))
      .filter((m): m is EmailMessage => m !== undefined)
      .sort(byDateAscending)
  }

  async listEvents(range: { from?: string; to?: string } = {}): Promise<CalendarEvent[]> {
    const timeMin = range.from ?? this.backfillStart()
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      timeMin,
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
      for (const [index, item] of parsed.items.entries()) {
        const event = toCalendarEvent(item)
        // A cancelled instance of a recurring event arrives without start or end; there is nothing
        // to track and the schema requires both.
        if (event) events.push(event)
        if (events.length >= this.maxEvents) {
          const sorted = sortEvents(events)
          // orderBy=startTime is ascending, so the ceiling keeps the soonest events and drops the
          // far end, the same way the message ceiling keeps the most recent mail: both hold on to
          // the slice nearest now. Only say it was cut when something was left behind.
          if (index < parsed.items.length - 1 || parsed.nextPageToken !== undefined) {
            this.counts.truncatedEvents = true
            this.onEvent({
              type: 'truncated',
              kind: 'events',
              limit: this.maxEvents,
              covered: { from: sorted[0]?.start ?? timeMin, to: sorted.at(-1)?.start ?? timeMin },
            })
          }
          return sorted
        }
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

  /**
   * Gmail returns ids newest first and offers no ordering parameter, so the ceiling keeps the most
   * recent mail in the window and stops. `truncated` is the whole signal available: the listing
   * stops rather than paging on to count what it is dropping.
   */
  private async listMessageIds(q: string): Promise<{ ids: string[]; truncated: boolean }> {
    const ids: string[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const params = new URLSearchParams({ q, maxResults: '100' })
      if (pageToken) params.set('pageToken', pageToken)
      const raw = await this.request(`${GMAIL_BASE}/users/me/messages?${params}`)
      const parsed = GmailListSchema.parse(raw)
      for (const [index, m] of parsed.messages.entries()) {
        ids.push(m.id)
        if (ids.length >= this.maxMessages) {
          const more = index < parsed.messages.length - 1 || parsed.nextPageToken !== undefined
          return { ids, truncated: more }
        }
      }
      pageToken = parsed.nextPageToken
      if (!pageToken) break
    }
    return { ids, truncated: false }
  }

  private async getMessage(id: string): Promise<EmailMessage | undefined> {
    const raw = await this.request(
      `${GMAIL_BASE}/users/me/messages/${encodeURIComponent(id)}?format=full`,
    )
    return this.toEmailMessage(raw, id)
  }

  /**
   * A message Gmail describes in a shape we cannot read is dropped rather than thrown: one bad
   * message in a fetch of 250 must not cost the other 249. The skip is counted and announced,
   * because a scan that quietly ingested 249 of 250 is worse than one that failed.
   */
  private toEmailMessage(raw: unknown, id: string): EmailMessage | undefined {
    const wire = GmailMessageSchema.safeParse(raw)
    if (!wire.success) return this.skip(id, firstIssue(wire.error))
    const message = wire.data
    const headers = message.payload?.headers ?? []
    const date = messageDate(message, headers)
    if (date === undefined) return this.skip(message.id, 'no usable date')
    const body = truncate(extractBody(message.payload), this.maxBodyChars)
    const snippet = decodeEntities(message.snippet) || body
    const parsed = EmailMessage.safeParse({
      id: message.id,
      threadId: message.threadId,
      from: headerValue(headers, 'from'),
      to: splitAddresses(headerValue(headers, 'to')),
      subject: headerValue(headers, 'subject'),
      date,
      snippet: truncate(snippet.replace(/\s+/g, ' ').trim(), 300),
      body,
      labels: message.labelIds,
    })
    if (!parsed.success) return this.skip(message.id, firstIssue(parsed.error))
    return parsed.data
  }

  private skip(id: string, reason: string): undefined {
    this.counts.skippedMessages++
    this.onEvent({ type: 'message_skipped', id, reason })
    return undefined
  }

  private async resolveToken(): Promise<string> {
    return typeof this.options.accessToken === 'function'
      ? await this.options.accessToken()
      : this.options.accessToken
  }

  private async request(url: string): Promise<unknown> {
    let token = await this.resolveToken()
    let reauthorized = false
    for (let attempt = 0; ; ) {
      const result = await this.attempt(url, token)
      if (result.ok) return result.body
      // A Google access token lives about an hour and a backfill makes hundreds of sequential
      // calls, so expiry mid-scan is the likeliest failure. Ask the caller for a fresh one once; a
      // plain string cannot be refreshed, and a second 401 is a refusal, not an expiry.
      if (
        result.status === 401 &&
        !reauthorized &&
        typeof this.options.accessToken === 'function'
      ) {
        reauthorized = true
        token = await this.resolveToken()
        continue
      }
      if (attempt < this.maxRetries && RETRYABLE.has(result.status)) {
        await sleep(
          retryDelayMs(result.retryAfter, attempt, this.retryBaseMs, this.retryMaxMs, this.now()),
        )
        attempt++
        continue
      }
      // The URL carries the search query but never the token, which lives in the header.
      throw new Error(
        `Google API ${result.status} for ${stripQuery(url)}${result.detail ? `: ${truncate(result.detail, 300)}` : ''}`,
      )
    }
  }

  /** One request under a timeout that covers reading the body, so a stalled stream also ends. */
  private async attempt(url: string, token: string): Promise<Attempt> {
    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, this.requestTimeoutMs)
    try {
      const response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: controller.signal,
      })
      if (response.ok) return { ok: true, body: await response.json() }
      return {
        ok: false,
        status: response.status,
        retryAfter: response.headers.get('retry-after'),
        detail: await response.text().catch(() => ''),
      }
    } catch (error) {
      if (timedOut)
        throw new Error(
          `Google API timed out after ${this.requestTimeoutMs}ms for ${stripQuery(url)}`,
        )
      throw error
    } finally {
      clearTimeout(timer)
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

/** `Retry-After` is whole seconds or an HTTP date. Anything else means the server said nothing. */
export function retryAfterMs(header: string | null, now: Date): number | undefined {
  if (header === null || header.trim() === '') return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const at = Date.parse(header)
  if (Number.isNaN(at)) return undefined
  return Math.max(0, at - now.getTime())
}

/**
 * How long to wait before trying again: what the server asked for, otherwise exponential backoff.
 * Both are jittered, because concurrent workers that back off by the same amount rebuild the burst
 * that throttled them. Half of the backoff is fixed so a retry cannot return almost immediately.
 */
export function retryDelayMs(
  retryAfter: string | null,
  attempt: number,
  baseMs: number,
  maxMs: number,
  now: Date,
  random: () => number = Math.random,
): number {
  const advertised = retryAfterMs(retryAfter, now)
  if (advertised !== undefined) return Math.min(advertised, maxMs) + random() * baseMs
  const delay = Math.min(baseMs * 2 ** attempt, maxMs)
  return delay / 2 + random() * (delay / 2)
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
): string | undefined {
  // internalDate is the delivery time Gmail sorts by, and is milliseconds since the epoch.
  if (message.internalDate !== undefined && message.internalDate !== '') {
    const ms = Number(message.internalDate)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  const header = Date.parse(headerValue(headers, 'date'))
  if (Number.isFinite(header)) return new Date(header).toISOString()
  return undefined
}

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (issue === undefined) return 'invalid message'
  return `${issue.path.join('.') || 'message'}: ${issue.message}`
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
