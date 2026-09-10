import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FixtureSource, OpenLoop } from '../src/index.js'
import { loop } from './store-contract.js'

const seed = fileURLToPath(new URL('../../../demo/seed-inbox.json', import.meta.url))

describe('demo fixtures', () => {
  it('load and validate against the schemas', async () => {
    const src = await FixtureSource.load(seed)
    expect(src.fixture.messages).toHaveLength(13)
    expect(src.fixture.events).toHaveLength(3)
  })

  it('return messages oldest first and filter by text, date and thread', async () => {
    const src = await FixtureSource.load(seed)
    const all = await src.listMessages()
    expect(all[0]?.id).toBe('msg-008')
    expect((await src.listMessages({ text: 'payment received' })).map((m) => m.id)).toEqual([
      'msg-003',
    ])
    expect((await src.getThread('thr-housing')).map((m) => m.id)).toEqual(['msg-002', 'msg-003'])
    expect(await src.listMessages({ after: '2026-09-09T00:00:00-04:00' })).toHaveLength(1)
  })

  it('return events overlapping a range', async () => {
    const src = await FixtureSource.load(seed)
    const week = await src.listEvents({
      from: '2026-09-08T00:00:00-04:00',
      to: '2026-09-12T00:00:00-04:00',
    })
    expect(week.map((e) => e.id)).toEqual(['evt-001', 'evt-002'])
  })
})

describe('OpenLoop schema', () => {
  it('applies defaults and rejects an empty sourceRefs list', () => {
    const parsed = OpenLoop.parse({
      ...loop(),
      owner: undefined,
      actionType: undefined,
      riskLevel: undefined,
      priority: undefined,
    })
    expect(parsed.owner).toBe('user')
    expect(() => OpenLoop.parse({ ...loop(), sourceRefs: [] })).toThrow()
  })
})
