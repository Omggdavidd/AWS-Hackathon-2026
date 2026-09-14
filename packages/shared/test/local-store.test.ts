import { mkdtemp, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { LocalLedgerStore } from '../src/index'
import { loop, runStoreContract } from './store-contract'

/**
 * A seam over the two calls that publish the ledger, so the persist tests can record what was
 * written where and can slow one write down on purpose. Everything else passes straight through to
 * the real filesystem; the race these tests describe reproduces on real disks only now and then.
 */
const spy = vi.hoisted(() => ({
  written: [] as string[],
  renamed: [] as string[],
  beforeWrite: undefined as ((path: string) => Promise<void>) | undefined,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...real,
    writeFile: async (path: string, data: string) => {
      spy.written.push(String(path))
      await spy.beforeWrite?.(String(path))
      return real.writeFile(path, data)
    },
    rename: async (from: string, to: string) => {
      spy.renamed.push(String(to))
      return real.rename(from, to)
    },
  }
})

afterEach(() => {
  spy.written.length = 0
  spy.renamed.length = 0
  spy.beforeWrite = undefined
})

runStoreContract('LocalLedgerStore (memory)', async () => new LocalLedgerStore())

const tempFile = async () => join(await mkdtemp(join(tmpdir(), 'openloop-')), 'ledger.json')

it('persists to a JSON file and reloads it', async () => {
  const file = await tempFile()
  const a = new LocalLedgerStore(file)
  await a.putLoop(loop())
  const b = await LocalLedgerStore.fromFile(file)
  expect(await b.getLoop('user-1', 'loop-1')).toMatchObject({ title: 'Pay registration deposit' })
})

it('starts empty when the file does not exist yet', async () => {
  const store = await LocalLedgerStore.fromFile(join(tmpdir(), `missing-${Date.now()}.json`))
  expect(await store.listLoops('user-1')).toEqual([])
})

it('publishes the ledger by rename, never writing the file in place', async () => {
  const file = await tempFile()
  const store = new LocalLedgerStore(file)
  await store.putLoop(loop())
  await store.appendAudit({
    id: 'e1',
    userId: 'user-1',
    at: '2026-09-10T13:00:00.000Z',
    kind: 'loop_created',
    actor: 'agent',
    reason: 'test',
  })
  // A reader that catches a partial in-place write sees truncated JSON and the app will not boot.
  expect(spy.written).not.toContain(file)
  expect(spy.written.every((p) => p.startsWith(`${file}.`) && p.endsWith('.tmp'))).toBe(true)
  expect(spy.renamed).toEqual([file, file])
  expect((await readdir(join(file, '..'))).filter((n) => n.endsWith('.tmp'))).toEqual([])
})

it('serialises writes, so a snapshot taken before the last mutation cannot land last', async () => {
  const file = await tempFile()
  const store = new LocalLedgerStore(file)
  let first = true
  spy.beforeWrite = async () => {
    if (!first) return
    first = false
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  // Two server actions mutating at once. Unserialised, the first write holds a snapshot taken
  // before the second loop existed, and landing last it would erase that loop from disk.
  await Promise.all([store.putLoop(loop({ id: 'a' })), store.putLoop(loop({ id: 'b' }))])
  spy.beforeWrite = undefined
  const reloaded = await LocalLedgerStore.fromFile(file)
  expect((await reloaded.listLoops('user-1')).map((l) => l.id).sort()).toEqual(['a', 'b'])
})

it('keeps every record when many writes overlap on a real disk', async () => {
  const file = await tempFile()
  const store = new LocalLedgerStore(file)
  const count = 40
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      store.putLoop(loop({ id: `loop-${i}`, consequence: 'y'.repeat(200) })),
    ),
  )
  const reloaded = await LocalLedgerStore.fromFile(file)
  expect(await reloaded.listLoops('user-1')).toHaveLength(count)
  expect(spy.renamed).toHaveLength(count)
})

it('names the file when its JSON is malformed', async () => {
  const file = await tempFile()
  await writeFile(file, '{"loops": [')
  await expect(LocalLedgerStore.fromFile(file)).rejects.toThrow(
    new RegExp(`Ledger file ${file.replaceAll('.', '\\.')} is not valid JSON`),
  )
})

it('names the file and the bad field when a record fails its schema', async () => {
  const file = await tempFile()
  await writeFile(file, JSON.stringify({ loops: [{ ...loop(), sourceRefs: [] }] }))
  await expect(LocalLedgerStore.fromFile(file)).rejects.toThrow(
    /does not match the ledger schemas[\s\S]*loops\[0\]\.sourceRefs/,
  )
})

it('rejects a record whose enum the schema does not know', async () => {
  const file = await tempFile()
  await writeFile(file, JSON.stringify({ loops: [{ ...loop(), status: 'ALMOST_DONE' }] }))
  await expect(LocalLedgerStore.fromFile(file)).rejects.toThrow(/loops\[0\]\.status/)
})

it('loads the seeded demo ledger', async () => {
  const seed = fileURLToPath(new URL('../../../demo/seed-ledger.json', import.meta.url))
  const store = await LocalLedgerStore.fromFile(seed)
  expect(await store.listLoops('user-alex')).toHaveLength(11)
  expect(await store.listActions('user-alex')).not.toHaveLength(0)
  expect(await store.listAudit('user-alex')).not.toHaveLength(0)
})
