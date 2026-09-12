import { describe, expect, it } from 'vitest'
import { jsonLogger, type LogLine, noopLogger, timed } from '../src/log'

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
