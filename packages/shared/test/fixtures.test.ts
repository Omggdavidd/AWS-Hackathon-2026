import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FixtureSource, mergeFixtures, OpenLoop } from '../src/index'
import { loop } from './store-contract'

const seed = fileURLToPath(new URL('../../../demo/seed-inbox.json', import.meta.url))
const deltaSeed = fileURLToPath(new URL('../../../demo/seed-inbox-delta.json', import.meta.url))

describe('demo fixtures', () => {
  it('load and validate against the schemas', async () => {
    const src = await FixtureSource.load(seed)
    expect(src.fixture.messages).toHaveLength(15)
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

  it('merge the delta batch on top of the base inbox without duplicates', async () => {
    const base = (await FixtureSource.load(seed)).fixture
    const delta = (await FixtureSource.load(deltaSeed)).fixture
    const merged = mergeFixtures(base, delta)
    expect(merged.messages).toHaveLength(base.messages.length + 4)
    expect(merged.persona.now).toBe(delta.persona.now)
    expect(mergeFixtures(merged, delta).messages).toHaveLength(merged.messages.length)
    const src = FixtureSource.fromDataWithDelta(base, delta)
    expect((await src.getThread('thr-deposit')).map((m) => m.id)).toEqual(['msg-001', 'msg-014'])
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

describe('demo expected ledger', () => {
  it('validates every record against the schemas and references known sources', async () => {
    const { readFile } = await import('node:fs/promises')
    const { AuditEvent, Evidence, OpenLoop, ProposedAction } = await import('../src/index')
    const raw = JSON.parse(
      await readFile(new URL('../../../demo/seed-ledger.json', import.meta.url), 'utf8'),
    )
    const loops = raw.loops.map((l: unknown) => OpenLoop.parse(l))
    const evidence = raw.evidence.map((e: unknown) => Evidence.parse(e))
    const actions = raw.actions.map((a: unknown) => ProposedAction.parse(a))
    raw.audit.map((a: unknown) => AuditEvent.parse(a))
    const src = await FixtureSource.load(seed)
    const known = new Set([
      ...src.fixture.messages.map((m) => m.id),
      ...src.fixture.events.map((e) => e.id),
    ])
    const loopIds = new Set(loops.map((l: { id: string }) => l.id))
    expect(loops).toHaveLength(11)
    for (const l of loops)
      for (const r of l.sourceRefs) expect(known.has(r.sourceId), r.sourceId).toBe(true)
    for (const e of evidence) expect(loopIds.has(e.loopId), e.loopId).toBe(true)
    for (const a of actions) expect(loopIds.has(a.loopId), a.loopId).toBe(true)
    for (const a of actions.filter((x: { riskTier: string }) => x.riskTier === 'high'))
      expect(a.requiresApproval).toBe(true)
  })
})
