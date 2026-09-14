import { GoogleSource } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { googleSourceLogger, jsonLogger, type LogLine, noopLogger, timed } from '../src/log'

describe('jsonLogger', () => {
  it('writes one JSON object per line, stamped with a timestamp', () => {
    const written: string[] = []
    const log = jsonLogger((chunk) => written.push(chunk))

    log({ evt: 'thread_started', threadId: 'thr-deposit', messages: 2 })

    expect(written).toHaveLength(1)
    expect(written[0]?.endsWith('\n')).toBe(true)
    const line = JSON.parse(written[0] ?? '')
    expect(line).toMatchObject({ evt: 'thread_started', threadId: 'thr-deposit', messages: 2 })
    expect(Date.parse(line.ts)).not.toBeNaN()
  })
})

describe('timed', () => {
  it('returns the result and logs the elapsed milliseconds', async () => {
    const lines: LogLine[] = []
    const result = await timed(
      (l) => lines.push(l),
      { evt: 'role', role: 'extract', threadId: 'thr-deposit' },
      async () => 'extracted',
    )

    expect(result).toBe('extracted')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ evt: 'role', role: 'extract', threadId: 'thr-deposit' })
    expect(typeof lines[0]?.ms).toBe('number')
  })

  it('logs the failure and rethrows, so a failing role is visible in the log', async () => {
    const lines: LogLine[] = []
    await expect(
      timed(
        (l) => lines.push(l),
        { evt: 'role', role: 'judge' },
        async () => {
          throw new Error('model refused')
        },
      ),
    ).rejects.toThrow('model refused')

    expect(lines[0]).toMatchObject({ evt: 'role', role: 'judge', error: 'model refused' })
    expect(typeof lines[0]?.ms).toBe('number')
  })
})

describe('noopLogger', () => {
  it('is the silent default, so the orchestrator has no side effects under test', () => {
    expect(() => noopLogger({ evt: 'scan_started' })).not.toThrow()
  })
})

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
