import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { LocalLedgerStore } from '../src/index.js'
import { loop, runStoreContract } from './store-contract.js'

runStoreContract('LocalLedgerStore (memory)', async () => new LocalLedgerStore())

it('persists to a JSON file and reloads it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'openloop-'))
  const file = join(dir, 'ledger.json')
  const a = new LocalLedgerStore(file)
  await a.putLoop(loop())
  const b = await LocalLedgerStore.fromFile(file)
  expect(await b.getLoop('user-1', 'loop-1')).toMatchObject({ title: 'Pay registration deposit' })
})

it('starts empty when the file does not exist yet', async () => {
  const store = await LocalLedgerStore.fromFile(join(tmpdir(), `missing-${Date.now()}.json`))
  expect(await store.listLoops('user-1')).toEqual([])
})
