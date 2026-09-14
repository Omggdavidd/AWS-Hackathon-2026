import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { FixtureSource, LocalLedgerStore, OpenLoop } from '@openloop/shared'
import { createSpecialists } from '../src/agents'
import { compareRuns } from '../src/agreement'
import { loadModel } from '../src/model'
import { runScan } from '../src/scan'

/**
 * Calibration harness: scan the demo inbox with the real model and compare each thread's status
 * with demo/seed-ledger.json. Needs AWS credentials; each scan costs about 95 to 105 seconds and
 * about fifty cents of Bedrock, so the default is one run. Ask for three only for a final check
 * before recording.
 *   pnpm --filter @openloop/agent agreement                 # 1 run
 *   OPENLOOP_AGREEMENT_RUNS=3 pnpm --filter @openloop/agent agreement
 *   pnpm --filter @openloop/agent agreement -- --verbose    # print every loop as the scan produces it
 */
const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const runCount = Number(process.env.OPENLOOP_AGREEMENT_RUNS ?? '1')
const verbose = process.argv.includes('--verbose')
const userId = 'user-alex'

const fixture = (await FixtureSource.load(path.join(repoRoot, 'demo', 'seed-inbox.json'))).fixture
const seedLedger = JSON.parse(
  await readFile(path.join(repoRoot, 'demo', 'seed-ledger.json'), 'utf8'),
)
const expected = (seedLedger.loops as unknown[]).map((l) => OpenLoop.parse(l))
const model = loadModel()

const results: OpenLoop[][] = []
for (let run = 1; run <= runCount; run++) {
  const source = FixtureSource.fromData(fixture)
  const store = new LocalLedgerStore()
  const specialists = createSpecialists({ model, source, store, userId })
  const started = Date.now()
  await runScan({
    source,
    store,
    userId,
    specialists,
    now: fixture.persona.now,
    onEvent: (e) => {
      if (verbose && e.type === 'loop') console.log(`  ${e.loop.status.padEnd(9)} ${e.loop.title}`)
    },
  })
  results.push(await store.listLoops(userId))
  console.log(`run ${run}/${runCount} done in ${Math.round((Date.now() - started) / 1000)}s`)
}

const report = compareRuns(expected, results)
const width = Math.max(...report.rows.map((r) => r.threadId.length))
const header = report.rows[0]?.runs.map((_, i) => `run ${i + 1}`.padEnd(10)).join('') ?? ''
console.log(`\n${'thread'.padEnd(width)}  ${'expected'.padEnd(10)}${header}`)
for (const row of report.rows)
  console.log(
    `${row.threadId.padEnd(width)}  ${row.expected.padEnd(10)}${row.runs.map((c) => c.padEnd(10)).join('')}${row.agrees ? '✓' : '✗'}`,
  )
console.log(`\nagreement ${report.agreed}/${report.total} threads over ${report.runs} runs`)
