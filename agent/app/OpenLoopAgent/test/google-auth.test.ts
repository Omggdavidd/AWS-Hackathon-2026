import { GoogleSource } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { GmailSourceSchema, googleAccessToken, googleSourceLogger } from '../src/google-auth'
import { jsonLogger, type LogLine } from '../src/log'

const REFRESH = {
  refreshToken: '1//refresh-abc',
  clientId: '123.apps.googleusercontent.com',
  clientSecret: 'fixture-client-secret',
}

/** A token endpoint that records what it was asked and answers with the tokens given, in order. */
function tokenEndpoint(tokens: string[], lifetimeSeconds = 3600) {
  const calls: { url: string; body: string }[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: String(init?.body ?? '') })
    const access_token = tokens[Math.min(calls.length - 1, tokens.length - 1)]
    return new Response(JSON.stringify({ access_token, expires_in: lifetimeSeconds }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

function failingEndpoint(status: number, body: string) {
  return (async () => new Response(body, { status })) as unknown as typeof fetch
}

describe('GmailSourceSchema', () => {
  it('accepts a payload with only an access token, exactly as the runtime took before', () => {
    const parsed = GmailSourceSchema.parse({ kind: 'gmail', accessToken: 'ya29.plain' })

    expect(parsed).toEqual({ kind: 'gmail', accessToken: 'ya29.plain', backfillDays: 90 })
    expect(parsed.refresh).toBeUndefined()
  })

  it('accepts refresh material alongside the access token', () => {
    const parsed = GmailSourceSchema.parse({
      kind: 'gmail',
      accessToken: 'ya29.plain',
      backfillDays: 30,
      refresh: REFRESH,
    })

    expect(parsed.refresh).toEqual(REFRESH)
    expect(parsed.backfillDays).toBe(30)
  })

  it('refuses half a credential, so a caller cannot think refresh is wired when it is not', () => {
    const partial = GmailSourceSchema.safeParse({
      kind: 'gmail',
      accessToken: 'ya29.plain',
      refresh: { refreshToken: '1//refresh-abc', clientId: '123' },
    })

    expect(partial.success).toBe(false)
  })
})

describe('googleAccessToken without refresh material', () => {
  it('is the plain string the caller gave, so nothing about today changes', () => {
    const token = googleAccessToken({ accessToken: 'ya29.plain' })

    expect(token).toBe('ya29.plain')
    expect(typeof token).toBe('string')
  })

  it('never reaches the network', async () => {
    const endpoint = tokenEndpoint(['unused'])
    const token = googleAccessToken({ accessToken: 'ya29.plain' }, endpoint)

    expect(token).toBe('ya29.plain')
    expect(endpoint.calls).toHaveLength(0)
  })
})

describe('googleAccessToken with refresh material', () => {
  it('exchanges the refresh token for a fresh access token', async () => {
    const endpoint = tokenEndpoint(['ya29.fresh'])
    const token = googleAccessToken({ accessToken: 'ya29.stale', refresh: REFRESH }, endpoint)

    expect(typeof token).toBe('function')
    expect(await (token as () => Promise<string>)()).toBe('ya29.fresh')
    expect(endpoint.calls).toHaveLength(1)
    expect(endpoint.calls[0]?.url).toBe('https://oauth2.googleapis.com/token')
    const form = new URLSearchParams(endpoint.calls[0]?.body ?? '')
    expect(form.get('grant_type')).toBe('refresh_token')
    expect(form.get('refresh_token')).toBe(REFRESH.refreshToken)
    expect(form.get('client_id')).toBe(REFRESH.clientId)
    expect(form.get('client_secret')).toBe(REFRESH.clientSecret)
  })

  it('caches until shortly before expiry, then exchanges again', async () => {
    const endpoint = tokenEndpoint(['ya29.first', 'ya29.second'], 3600)
    let clock = 0
    const resolve = googleAccessToken(
      { accessToken: 'ya29.stale', refresh: REFRESH },
      {
        ...endpoint,
        now: () => clock,
      },
    ) as () => Promise<string>

    expect(await resolve()).toBe('ya29.first')
    clock = 3_400_000
    expect(await resolve()).toBe('ya29.first')
    expect(endpoint.calls).toHaveLength(1)

    // Inside the skew: the token would die between resolving it and using it.
    clock = 3_560_000
    expect(await resolve()).toBe('ya29.second')
    expect(endpoint.calls).toHaveLength(2)
  })

  it('makes one exchange for the workers that resolve at the same moment', async () => {
    const endpoint = tokenEndpoint(['ya29.fresh'])
    const resolve = googleAccessToken(
      { accessToken: 'ya29.stale', refresh: REFRESH },
      endpoint,
    ) as () => Promise<string>

    const all = await Promise.all([resolve(), resolve(), resolve(), resolve(), resolve()])

    expect(all).toEqual(Array(5).fill('ya29.fresh'))
    expect(endpoint.calls).toHaveLength(1)
  })

  it('names a rejected refresh without carrying the credential', async () => {
    const resolve = googleAccessToken(
      { accessToken: 'ya29.stale', refresh: REFRESH },
      { fetchImpl: failingEndpoint(400, '{"error":"invalid_grant"}') },
    ) as () => Promise<string>

    await expect(resolve()).rejects.toThrow(/Google token refresh failed: 400 .*invalid_grant/)
    await expect(resolve()).rejects.not.toThrow(new RegExp(REFRESH.clientSecret))
  })

  it('names a token response it cannot read', async () => {
    const resolve = googleAccessToken(
      { accessToken: 'ya29.stale', refresh: REFRESH },
      {
        fetchImpl: (async () => new Response('<html>504</html>', { status: 200 })) as typeof fetch,
      },
    ) as () => Promise<string>

    await expect(resolve()).rejects.toThrow(
      'Google token refresh failed: unreadable token response',
    )
  })

  it('names a network failure', async () => {
    const resolve = googleAccessToken(
      { accessToken: 'ya29.stale', refresh: REFRESH },
      {
        fetchImpl: (async () => {
          throw new Error('getaddrinfo ENOTFOUND oauth2.googleapis.com')
        }) as typeof fetch,
      },
    ) as () => Promise<string>

    await expect(resolve()).rejects.toThrow(
      'Google token refresh failed: getaddrinfo ENOTFOUND oauth2.googleapis.com',
    )
  })

  it('lets the next caller try again after a failure', async () => {
    let attempt = 0
    const fetchImpl = (async () => {
      attempt++
      if (attempt === 1) return new Response('{"error":"backend"}', { status: 500 })
      return new Response(JSON.stringify({ access_token: 'ya29.late', expires_in: 3600 }), {
        status: 200,
      })
    }) as unknown as typeof fetch
    const resolve = googleAccessToken(
      { accessToken: 'ya29.stale', refresh: REFRESH },
      { fetchImpl },
    ) as () => Promise<string>

    await expect(resolve()).rejects.toThrow('Google token refresh failed: 500')
    expect(await resolve()).toBe('ya29.late')
  })
})

describe('the refresh secret', () => {
  it('is struck from an error even when the server echoes it back', async () => {
    const resolve = googleAccessToken(
      { accessToken: 'ya29.stale', refresh: REFRESH },
      {
        fetchImpl: failingEndpoint(
          401,
          `{"error":"unauthorized_client","secret":"${REFRESH.clientSecret}","rt":"${REFRESH.refreshToken}"}`,
        ),
      },
    ) as () => Promise<string>

    const error = await resolve().catch((e: unknown) => e)

    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain('unauthorized_client')
    expect(message).toContain('[redacted]')
    expect(message).not.toContain(REFRESH.clientSecret)
    expect(message).not.toContain(REFRESH.refreshToken)
  })

  it('reaches no log line on the path that logs a failed exchange', async () => {
    const written: string[] = []
    const log = jsonLogger((chunk) => written.push(chunk))
    const resolve = googleAccessToken(
      { accessToken: 'ya29.stale', refresh: REFRESH },
      { fetchImpl: failingEndpoint(400, `{"client_secret":"${REFRESH.clientSecret}"}`) },
    ) as () => Promise<string>

    // What the runtime does with a thrown step: `timed` logs the message and rethrows.
    const error = await resolve().catch((e: unknown) => e)
    log({ evt: 'source_failed', error: (error as Error).message })

    const all = written.join('')
    expect(all).toContain('source_failed')
    expect(all).not.toContain(REFRESH.clientSecret)
    expect(all).not.toContain(REFRESH.refreshToken)
  })
})

/** Gmail's wire shapes, small enough to drive `GoogleSource` without a network. */
function gmailStub(messages: { id: string; body: unknown }[], listIds = messages.map((m) => m.id)) {
  return (async (input: string | URL | Request) => {
    const href = String(input)
    if (href.includes('/messages?'))
      return new Response(JSON.stringify({ messages: listIds.map((id) => ({ id })) }), {
        status: 200,
      })
    const id = href.split('/messages/')[1]?.split('?')[0] ?? ''
    const found = messages.find((m) => m.id === decodeURIComponent(id))
    return new Response(JSON.stringify(found?.body ?? {}), { status: 200 })
  }) as unknown as typeof fetch
}

function fullMessage(id: string, subject: string, from: string, body: string) {
  return {
    id,
    threadId: `thr-${id}`,
    internalDate: `${Date.parse('2026-09-12T09:00:00Z')}`,
    snippet: subject,
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'Subject', value: subject },
        { name: 'From', value: from },
        { name: 'To', value: 'alex@example.com' },
      ],
      body: { data: Buffer.from(body, 'utf8').toString('base64url') },
    },
  }
}

describe('googleSourceLogger', () => {
  it('logs the id and reason of a message Gmail described in a shape we cannot read', async () => {
    const lines: LogLine[] = []
    const source = new GoogleSource({
      accessToken: 'ya29.plain',
      onEvent: googleSourceLogger((line) => lines.push(line)),
      fetchImpl: gmailStub([
        {
          id: 'msg-good',
          body: fullMessage('msg-good', 'Deposit due', 'landlord@example.com', 'Pay by Friday'),
        },
        { id: 'msg-bad', body: { id: 'msg-bad', threadId: 'thr-bad', internalDate: 'not-a-date' } },
      ]),
    })

    const messages = await source.listMessages({ after: '2026-09-01T00:00:00Z' })

    expect(messages.map((m) => m.id)).toEqual(['msg-good'])
    expect(lines).toEqual([
      { evt: 'source_message_skipped', messageId: 'msg-bad', reason: 'no usable date' },
    ])
    expect(source.stats.skippedMessages).toBe(1)
  })

  it('logs a truncated listing with its ceiling and the window it actually covered', async () => {
    const lines: LogLine[] = []
    const source = new GoogleSource({
      accessToken: 'ya29.plain',
      maxMessages: 1,
      onEvent: googleSourceLogger((line) => lines.push(line)),
      fetchImpl: gmailStub([
        { id: 'msg-1', body: fullMessage('msg-1', 'Deposit due', 'landlord@example.com', 'Pay') },
        { id: 'msg-2', body: fullMessage('msg-2', 'Second', 'other@example.com', 'Later') },
      ]),
    })

    await source.listMessages({ after: '2026-09-01T00:00:00Z' })

    expect(lines).toEqual([
      {
        evt: 'source_truncated',
        kind: 'messages',
        limit: 1,
        from: '2026-09-12T09:00:00.000Z',
        to: '2026-09-12T09:00:00.000Z',
      },
    ])
    expect(source.stats.truncatedMessages).toBe(true)
  })

  it('never writes a subject, a body or an address', async () => {
    const written: string[] = []
    const log = jsonLogger((chunk) => written.push(chunk))
    const source = new GoogleSource({
      accessToken: 'ya29.plain',
      maxMessages: 1,
      onEvent: googleSourceLogger(log),
      fetchImpl: gmailStub([
        {
          id: 'msg-1',
          body: fullMessage('msg-1', 'Security deposit', 'landlord@example.com', 'Wire $2,400'),
        },
        { id: 'msg-2', body: { id: 'msg-2' } },
      ]),
    })

    await source.listMessages({ after: '2026-09-01T00:00:00Z' })
    log({ evt: 'source_stats', ...source.stats })

    const all = written.join('')
    expect(all).toContain('source_truncated')
    expect(all).toContain('"skippedMessages"')
    for (const leak of [
      'Security deposit',
      'landlord@example.com',
      'Wire $2,400',
      'alex@example.com',
    ])
      expect(all).not.toContain(leak)
  })
})

describe('the source the runtime composes from a gmail payload', () => {
  it('reads with a token it exchanged, and exchanges again once that one is spent', async () => {
    const payload = GmailSourceSchema.parse({
      kind: 'gmail',
      accessToken: 'ya29.handed-over',
      refresh: REFRESH,
    })
    const bearers: string[] = []
    let issued = 0
    let clock = 0
    const gmail = gmailStub([
      { id: 'msg-1', body: fullMessage('msg-1', 'Deposit due', 'landlord@example.com', 'Pay') },
    ])
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith('https://oauth2.googleapis.com/token'))
        return new Response(JSON.stringify({ access_token: `ya29.issued-${++issued}` }), {
          status: 200,
        })
      bearers.push(String(new Headers(init?.headers).get('authorization')))
      return gmail(input, init)
    }) as unknown as typeof fetch
    const source = new GoogleSource({
      accessToken: googleAccessToken(payload, { fetchImpl, now: () => clock }),
      backfillDays: payload.backfillDays,
      fetchImpl,
    })

    await source.listMessages({ after: '2026-09-01T00:00:00Z' })
    clock = 4_000_000
    await source.listMessages({ after: '2026-09-01T00:00:00Z' })

    expect(issued).toBe(2)
    expect(bearers).toEqual([
      'Bearer ya29.issued-1',
      'Bearer ya29.issued-1',
      'Bearer ya29.issued-2',
      'Bearer ya29.issued-2',
    ])
    expect(bearers).not.toContain('Bearer ya29.handed-over')
  })
})
