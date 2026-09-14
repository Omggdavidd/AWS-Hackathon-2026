import { describe, expect, it } from 'vitest'
import {
  extractBody,
  GoogleSource,
  type GoogleSourceEvent,
  gmailQuery,
  retryAfterMs,
  retryDelayMs,
  splitAddresses,
  stripHtml,
} from '../src/index'

const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64url')

/** One Gmail message as the API returns it. */
function gmailMessage(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'm1',
    threadId: 't1',
    labelIds: ['INBOX', 'UNREAD'],
    snippet: 'Your deposit of &#36;1,200 is due',
    internalDate: '1757764800000', // 2025-09-13T12:00:00Z
    payload: {
      mimeType: 'multipart/alternative',
      headers: [
        { name: 'From', value: 'Maple Court <billing@maplecourt.example>' },
        { name: 'To', value: '"Alex Rivera" <alex@example.com>, ops@example.com' },
        { name: 'Subject', value: 'Deposit due before move-in' },
        { name: 'Date', value: 'Sat, 13 Sep 2025 08:00:00 -0400' },
      ],
      parts: [
        { mimeType: 'text/plain', body: { data: b64('Please send the $1,200 deposit.') } },
        { mimeType: 'text/html', body: { data: b64('<p>Please send the deposit.</p>') } },
      ],
    },
    ...over,
  }
}

/** A fetch stub that answers by URL and records what it was asked. */
function stubFetch(routes: (url: string) => unknown, calls: string[] = []) {
  const impl = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    const body = routes(url)
    if (body instanceof Response) return body
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { impl, calls }
}

function source(routes: (url: string) => unknown, over: Record<string, unknown> = {}) {
  const { impl, calls } = stubFetch(routes)
  return {
    calls,
    src: new GoogleSource({
      accessToken: 'token-123',
      fetchImpl: impl,
      retryBaseMs: 0,
      now: () => new Date('2025-09-20T00:00:00Z'),
      ...over,
    }),
  }
}

describe('GoogleSource messages', () => {
  it('lists a message and maps it onto the shared EmailMessage schema', async () => {
    const { src, calls } = source((url) =>
      url.includes('/messages?') ? { messages: [{ id: 'm1' }] } : gmailMessage(),
    )
    const [message] = await src.listMessages()

    expect(message).toEqual({
      id: 'm1',
      threadId: 't1',
      from: 'Maple Court <billing@maplecourt.example>',
      to: ['"Alex Rivera" <alex@example.com>', 'ops@example.com'],
      subject: 'Deposit due before move-in',
      date: '2025-09-13T12:00:00.000Z',
      // Entities decoded, and text/plain preferred over the HTML alternative.
      snippet: 'Your deposit of $1,200 is due',
      body: 'Please send the $1,200 deposit.',
      labels: ['INBOX', 'UNREAD'],
    })
    // The token travels in the header, never the URL.
    expect(calls.every((c) => !c.includes('token-123'))).toBe(true)
  })

  it('sends the bearer token on every call', async () => {
    let seen: string | null = null
    const impl = (async (_input: unknown, init?: RequestInit) => {
      seen = new Headers(init?.headers).get('authorization')
      return new Response(JSON.stringify({ messages: [] }), { status: 200 })
    }) as unknown as typeof fetch
    await new GoogleSource({
      accessToken: async () => 'fresh-token',
      fetchImpl: impl,
    }).listMessages()
    expect(seen).toBe('Bearer fresh-token')
  })

  it('defaults to a 90-day backfill and narrows the fuzzy server window itself', async () => {
    const { src, calls } = source((url) =>
      url.includes('/messages?')
        ? { messages: [{ id: 'old' }, { id: 'recent' }] }
        : url.includes('/messages/old')
          ? gmailMessage({ id: 'old', internalDate: '1740000000000' }) // 2025-02-19, outside 90 days
          : gmailMessage({ id: 'recent' }),
    )
    const messages = await src.listMessages()

    // now - 90d = 2025-06-22; the query is widened by a day, the exact bound applied in code.
    expect(decodeURIComponent(calls[0] ?? '')).toContain('q=after:2025/06/21')
    expect(messages.map((m) => m.id)).toEqual(['recent'])
  })

  it('pages through message ids and stops at maxMessages', async () => {
    const { src, calls } = source(
      (url) => {
        if (url.includes('/messages?')) {
          return url.includes('pageToken=p2')
            ? { messages: [{ id: 'm3' }] }
            : { messages: [{ id: 'm1' }, { id: 'm2' }], nextPageToken: 'p2' }
        }
        const id = url.split('/messages/')[1]?.split('?')[0] ?? 'm1'
        return gmailMessage({ id, internalDate: `17577648${id.slice(1)}0000` })
      },
      { maxMessages: 3 },
    )
    const messages = await src.listMessages()
    expect(messages).toHaveLength(3)
    expect(calls.filter((c) => c.includes('/messages?'))).toHaveLength(2)
  })

  it('returns a thread oldest first without searching', async () => {
    const { src, calls } = source(() => ({
      messages: [
        gmailMessage({ id: 'b', internalDate: '1757851200000' }),
        gmailMessage({ id: 'a', internalDate: '1757764800000' }),
      ],
    }))
    const thread = await src.getThread('t1')
    expect(thread.map((m) => m.id)).toEqual(['a', 'b'])
    expect(calls[0]).toContain('/threads/t1')
  })

  it('applies the text filter to a thread query too', async () => {
    const { src } = source(() => ({
      messages: [
        gmailMessage({ id: 'a' }),
        gmailMessage({
          id: 'b',
          snippet: 'unrelated',
          payload: {
            mimeType: 'text/plain',
            headers: [{ name: 'Subject', value: 'Lunch' }],
            body: { data: b64('nothing owed') },
          },
        }),
      ],
    }))
    const found = await src.listMessages({ threadId: 't1', text: 'deposit' })
    expect(found.map((m) => m.id)).toEqual(['a'])
  })

  it('cuts long bodies so a whole newsletter never reaches a model', async () => {
    const { src } = source(
      (url) =>
        url.includes('/messages?')
          ? { messages: [{ id: 'm1' }] }
          : gmailMessage({
              payload: {
                mimeType: 'text/plain',
                headers: [{ name: 'Subject', value: 'Long' }],
                body: { data: b64('x'.repeat(5000)) },
              },
            }),
      { maxBodyChars: 100 },
    )
    const [message] = await src.listMessages()
    expect(message?.body).toHaveLength(100)
  })

  it('retries a 429 and then succeeds', async () => {
    let attempts = 0
    const impl = (async () => {
      attempts++
      if (attempts === 1) return new Response('rate limited', { status: 429 })
      return new Response(JSON.stringify({ messages: [] }), { status: 200 })
    }) as unknown as typeof fetch
    const src = new GoogleSource({ accessToken: 't', fetchImpl: impl, retryBaseMs: 0 })
    expect(await src.listMessages()).toEqual([])
    expect(attempts).toBe(2)
  })

  it('reports a refused token instead of returning an empty inbox', async () => {
    const impl = (async () =>
      new Response('{"error":{"message":"Invalid Credentials"}}', {
        status: 401,
      })) as unknown as typeof fetch
    const src = new GoogleSource({ accessToken: 'stale', fetchImpl: impl, retryBaseMs: 0 })
    await expect(src.listMessages()).rejects.toThrow(/401.*Invalid Credentials/s)
  })
})

describe('GoogleSource events', () => {
  it('maps timed and all-day events and sorts them by start', async () => {
    const { src, calls } = source(() => ({
      items: [
        {
          id: 'e2',
          summary: 'Move-in inspection',
          start: { date: '2025-09-16' },
          end: { date: '2025-09-17' },
          status: 'confirmed',
        },
        {
          id: 'e1',
          summary: 'Club meeting',
          start: { dateTime: '2025-09-15T18:00:00-04:00' },
          end: { dateTime: '2025-09-15T19:00:00-04:00' },
          location: 'Library',
          attendees: [{ email: 'sam@example.com' }, {}],
          status: 'tentative',
          updated: '2025-09-10T11:00:00.000Z',
        },
      ],
    }))
    const events = await src.listEvents({ from: '2025-09-14T00:00:00Z' })

    expect(events.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(events[0]).toMatchObject({
      title: 'Club meeting',
      start: '2025-09-15T22:00:00.000Z',
      location: 'Library',
      attendees: ['sam@example.com'],
      status: 'tentative',
      updatedAt: '2025-09-10T11:00:00.000Z',
    })
    expect(events[1]?.start).toBe('2025-09-16T00:00:00Z')
    expect(calls[0]).toContain('timeMin=2025-09-14T00%3A00%3A00Z')
    expect(calls[0]).toContain('singleEvents=true')
  })

  it('skips a cancelled instance that carries no times', async () => {
    const { src } = source(() => ({
      items: [
        { id: 'gone', status: 'cancelled' },
        { id: 'kept', start: { date: '2025-09-16' }, end: { date: '2025-09-17' } },
      ],
    }))
    expect((await src.listEvents()).map((e) => e.id)).toEqual(['kept'])
  })
})

describe('Gmail helpers', () => {
  it('builds a query that widens the whole-day window at both ends', () => {
    expect(
      gmailQuery({
        after: '2025-09-10T00:00:00Z',
        before: '2025-09-12T00:00:00Z',
        text: 'de"posit',
      }),
    ).toBe('after:2025/09/09 before:2025/09/13 "deposit"')
    expect(gmailQuery({})).toBe('')
  })

  it('prefers text/plain, falls back to stripped HTML, and walks nested parts', () => {
    expect(
      extractBody({
        mimeType: 'multipart/mixed',
        parts: [
          { mimeType: 'application/pdf', filename: 'lease.pdf', body: { data: b64('binary') } },
          {
            mimeType: 'multipart/alternative',
            parts: [{ mimeType: 'text/plain', body: { data: b64('the plain one') } }],
          },
        ],
      }),
    ).toBe('the plain one')

    expect(
      extractBody({
        mimeType: 'text/html',
        body: { data: b64('<p>hi<br>there</p><script>x()</script>') },
      }),
    ).toBe('hi\nthere')

    expect(extractBody(undefined)).toBe('')
  })

  it('strips markup and decodes entities', () => {
    expect(stripHtml('<div>Rent is &#36;1,200 &amp; due</div>')).toBe('Rent is $1,200 & due')
    // An out-of-range numeric entity must not throw and abort the whole scan.
    expect(stripHtml('<p>hi &#99999999; there &#xFFFFFFFF;</p>')).toBe(
      'hi &#99999999; there &#xFFFFFFFF;',
    )
  })

  it('splits an address list without breaking a quoted comma', () => {
    expect(splitAddresses('"Rivera, Alex" <a@x.com>, b@y.com')).toEqual([
      '"Rivera, Alex" <a@x.com>',
      'b@y.com',
    ])
    expect(splitAddresses('')).toEqual([])
  })
})

describe('GoogleSource paging safety', () => {
  it('stops instead of looping when a page repeats its token forever', async () => {
    let calls = 0
    const impl = (async () => {
      calls++
      return new Response(JSON.stringify({ items: [], nextPageToken: 'same' }), { status: 200 })
    }) as unknown as typeof fetch
    const src = new GoogleSource({ accessToken: 't', fetchImpl: impl, retryBaseMs: 0 })
    expect(await src.listEvents()).toEqual([])
    expect(calls).toBeLessThanOrEqual(50)
  })
})

describe('GoogleSource timeouts', () => {
  /** A connection that accepts the request and then says nothing until it is aborted. */
  const hangs = (async (_input: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError')),
      )
    })) as unknown as typeof fetch

  it('gives up on a hung connection and says so instead of returning nothing', async () => {
    const src = new GoogleSource({
      accessToken: 't',
      fetchImpl: hangs,
      requestTimeoutMs: 20,
      retryBaseMs: 0,
    })
    await expect(src.listMessages()).rejects.toThrow(
      /timed out after 20ms for https:\/\/gmail\.googleapis\.com/,
    )
  })

  it('times a calendar read out too', async () => {
    const src = new GoogleSource({
      accessToken: 't',
      fetchImpl: hangs,
      requestTimeoutMs: 20,
      retryBaseMs: 0,
    })
    await expect(src.listEvents()).rejects.toThrow(/timed out after 20ms/)
  })
})

describe('GoogleSource token expiry', () => {
  /** 401s anything but the second token the caller hands out. */
  function refusing(fresh: string) {
    const seen: string[] = []
    const impl = (async (_input: unknown, init?: RequestInit) => {
      const auth = new Headers(init?.headers).get('authorization') ?? ''
      seen.push(auth)
      if (auth === `Bearer ${fresh}`) {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 })
      }
      return new Response('{"error":{"message":"Invalid Credentials"}}', { status: 401 })
    }) as unknown as typeof fetch
    return { impl, seen }
  }

  it('re-resolves the token once on a 401 and carries on with the fresh one', async () => {
    const { impl, seen } = refusing('token-2')
    let issued = 0
    const src = new GoogleSource({
      accessToken: () => `token-${++issued}`,
      fetchImpl: impl,
      retryBaseMs: 0,
    })
    expect(await src.listMessages()).toEqual([])
    expect(seen).toEqual(['Bearer token-1', 'Bearer token-2'])
    expect(issued).toBe(2)
  })

  it('surfaces the second 401 rather than asking for tokens forever', async () => {
    const { impl, seen } = refusing('never-issued')
    let issued = 0
    const src = new GoogleSource({
      accessToken: () => {
        issued++
        return 'still-stale'
      },
      fetchImpl: impl,
      retryBaseMs: 0,
    })
    await expect(src.listMessages()).rejects.toThrow(/401.*Invalid Credentials/s)
    expect(issued).toBe(2)
    expect(seen).toHaveLength(2)
  })

  it('does not retry a 401 when the token is a string re-resolving cannot refresh', async () => {
    const { impl, seen } = refusing('never-issued')
    const src = new GoogleSource({ accessToken: 'stale', fetchImpl: impl, retryBaseMs: 0 })
    await expect(src.listMessages()).rejects.toThrow(/401/)
    expect(seen).toEqual(['Bearer stale'])
  })
})

describe('GoogleSource malformed messages', () => {
  /** Records what the source says it skipped or cut short. */
  function watched(routes: (url: string) => unknown, over: Record<string, unknown> = {}) {
    const events: GoogleSourceEvent[] = []
    const { src, calls } = source(routes, {
      onEvent: (e: GoogleSourceEvent) => events.push(e),
      ...over,
    })
    return { src, calls, events }
  }

  it('skips the one message it cannot read and keeps the rest of the batch', async () => {
    const { src, events } = watched((url) => {
      if (url.includes('/messages?')) {
        return { messages: [{ id: 'm1' }, { id: 'bad' }, { id: 'm3' }] }
      }
      if (url.includes('/messages/bad')) return { id: 'bad', snippet: 'no threadId here' }
      const id = url.includes('/messages/m3') ? 'm3' : 'm1'
      return gmailMessage({ id })
    })
    const messages = await src.listMessages()

    expect(messages.map((m) => m.id)).toEqual(['m1', 'm3'])
    expect(src.stats.skippedMessages).toBe(1)
    expect(events).toEqual([
      {
        type: 'message_skipped',
        id: 'bad',
        reason: 'threadId: Invalid input: expected string, received undefined',
      },
    ])
  })

  it('skips a message with no date to place it by instead of throwing', async () => {
    const { src, events } = watched((url) =>
      url.includes('/messages?')
        ? { messages: [{ id: 'undated' }] }
        : gmailMessage({
            id: 'undated',
            internalDate: 'not-a-number',
            payload: { mimeType: 'text/plain', headers: [{ name: 'Subject', value: 'When?' }] },
          }),
    )
    expect(await src.listMessages()).toEqual([])
    expect(src.stats.skippedMessages).toBe(1)
    expect(events[0]).toEqual({ type: 'message_skipped', id: 'undated', reason: 'no usable date' })
  })

  it('keeps the readable messages of a thread when one of them is unreadable', async () => {
    const { src, events } = watched(() => ({
      messages: [gmailMessage({ id: 'a' }), { id: 'b', threadId: 't1', internalDate: 'never' }],
    }))
    const thread = await src.getThread('t1')

    expect(thread.map((m) => m.id)).toEqual(['a'])
    expect(src.stats.skippedMessages).toBe(1)
    expect(events[0]).toMatchObject({ type: 'message_skipped', id: 'b' })
  })

  it('counts nothing when every message reads cleanly', async () => {
    const { src, events } = watched((url) =>
      url.includes('/messages?') ? { messages: [{ id: 'm1' }] } : gmailMessage(),
    )
    expect(await src.listMessages()).toHaveLength(1)
    expect(src.stats).toEqual({
      skippedMessages: 0,
      truncatedMessages: false,
      truncatedEvents: false,
    })
    expect(events).toEqual([])
  })
})

describe('GoogleSource backoff', () => {
  const ok = () => new Response(JSON.stringify({ messages: [] }), { status: 200 })

  it('waits as long as Retry-After asks before trying again', async () => {
    let attempts = 0
    const impl = (async () => {
      attempts++
      // Sub-second so the suite stays fast; the parser reads it the same way as Google's seconds.
      return attempts === 1
        ? new Response('slow down', { status: 429, headers: { 'retry-after': '0.08' } })
        : ok()
    }) as unknown as typeof fetch
    const startedAt = Date.now()
    const src = new GoogleSource({ accessToken: 't', fetchImpl: impl, retryBaseMs: 0 })
    expect(await src.listMessages()).toEqual([])
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(50)
    expect(attempts).toBe(2)
  })

  it('does not wait at all when the server sends no Retry-After and the base is zero', async () => {
    let attempts = 0
    const impl = (async () => {
      attempts++
      return attempts === 1 ? new Response('busy', { status: 503 }) : ok()
    }) as unknown as typeof fetch
    const startedAt = Date.now()
    const src = new GoogleSource({ accessToken: 't', fetchImpl: impl, retryBaseMs: 0 })
    expect(await src.listMessages()).toEqual([])
    expect(Date.now() - startedAt).toBeLessThan(50)
  })

  it('stops after maxRetries and reports the status it last saw', async () => {
    let attempts = 0
    const impl = (async () => {
      attempts++
      return new Response('backend error', { status: 503 })
    }) as unknown as typeof fetch
    const src = new GoogleSource({
      accessToken: 't',
      fetchImpl: impl,
      retryBaseMs: 0,
      maxRetries: 2,
    })
    await expect(src.listMessages()).rejects.toThrow(/Google API 503.*backend error/s)
    expect(attempts).toBe(3)
  })

  it('reads Retry-After as seconds, as a date, or not at all', () => {
    const now = new Date('2025-09-20T00:00:00Z')
    expect(retryAfterMs('2', now)).toBe(2000)
    expect(retryAfterMs('0', now)).toBe(0)
    expect(retryAfterMs('Sat, 20 Sep 2025 00:00:30 GMT', now)).toBe(30_000)
    // A date already past, and anything unparseable, must not push the wait negative or NaN.
    expect(retryAfterMs('Sat, 20 Sep 2024 00:00:00 GMT', now)).toBe(0)
    expect(retryAfterMs('soon', now)).toBeUndefined()
    expect(retryAfterMs(null, now)).toBeUndefined()
  })

  it('caps Retry-After and jitters a backoff so concurrent workers do not retry in lockstep', () => {
    const now = new Date('2025-09-20T00:00:00Z')
    expect(retryDelayMs('600', 0, 250, 30_000, now, () => 0)).toBe(30_000)

    const delays = Array.from({ length: 20 }, () =>
      retryDelayMs(null, 2, 250, 30_000, now, Math.random),
    )
    // Attempt 2 of a 250ms base is a 1000ms window: half fixed, half spread.
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(500)
      expect(delay).toBeLessThanOrEqual(1000)
    }
    expect(new Set(delays).size).toBeGreaterThan(1)
  })
})

describe('GoogleSource truncation', () => {
  /** Gmail's list is newest first and has no ordering parameter. */
  const newestFirst = ['sep13', 'sep12', 'sep11']
  const dates: Record<string, string> = {
    sep13: '1757764800000', // 2025-09-13T12:00:00Z
    sep12: '1757678400000',
    sep11: '1757592000000',
  }

  function listing(ids: string[], over: Record<string, unknown>) {
    const events: GoogleSourceEvent[] = []
    const { src, calls } = source(
      (url) => {
        if (url.includes('/messages?')) return { messages: ids.map((id) => ({ id })) }
        const id = url.split('/messages/')[1]?.split('?')[0] ?? ''
        return gmailMessage({ id, internalDate: dates[id] })
      },
      { onEvent: (e: GoogleSourceEvent) => events.push(e), ...over },
    )
    return { src, calls, events }
  }

  it('keeps the most recent mail, never fetches the rest, and reports the window it covered', async () => {
    const { src, calls, events } = listing(newestFirst, { maxMessages: 2 })
    const messages = await src.listMessages()

    // Oldest first on the way out, but the ceiling cut the far end of the window, not the near one.
    expect(messages.map((m) => m.id)).toEqual(['sep12', 'sep13'])
    expect(calls.some((c) => c.includes('/messages/sep11'))).toBe(false)
    expect(src.stats.truncatedMessages).toBe(true)
    expect(events).toEqual([
      {
        type: 'truncated',
        kind: 'messages',
        limit: 2,
        covered: { from: '2025-09-12T12:00:00.000Z', to: '2025-09-13T12:00:00.000Z' },
      },
    ])
  })

  it('says nothing when the ceiling lands exactly on the last message there was', async () => {
    const { src, events } = listing(['sep13', 'sep12'], { maxMessages: 2 })
    expect(await src.listMessages()).toHaveLength(2)
    expect(src.stats.truncatedMessages).toBe(false)
    expect(events).toEqual([])
  })

  it('reports a calendar listing the ceiling cut short', async () => {
    const events: GoogleSourceEvent[] = []
    const { src } = source(
      () => ({
        items: [
          { id: 'e1', start: { date: '2025-09-15' }, end: { date: '2025-09-16' } },
          { id: 'e2', start: { date: '2025-09-16' }, end: { date: '2025-09-17' } },
          { id: 'e3', start: { date: '2025-09-17' }, end: { date: '2025-09-18' } },
        ],
      }),
      { maxEvents: 2, onEvent: (e: GoogleSourceEvent) => events.push(e) },
    )
    const found = await src.listEvents({ from: '2025-09-14T00:00:00Z' })

    // orderBy=startTime is ascending, so the ceiling keeps the soonest: the near end again.
    expect(found.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(src.stats.truncatedEvents).toBe(true)
    expect(events).toEqual([
      {
        type: 'truncated',
        kind: 'events',
        limit: 2,
        covered: { from: '2025-09-15T00:00:00Z', to: '2025-09-16T00:00:00Z' },
      },
    ])
  })
})
