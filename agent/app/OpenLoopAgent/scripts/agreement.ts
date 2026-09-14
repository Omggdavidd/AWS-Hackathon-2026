import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { FixtureSource, LocalLedgerStore, OpenLoop } from '@openloop/shared'
import { createSpecialists } from '../src/agents'
import { agreementOptions, calibrationInput, compareRuns } from '../src/agreement'
import { loadModel } from '../src/model'
import { runScan } from '../src/scan'

/** Real-model calibration. Defaults to one representative subset; --full checks the showcase. */
const {
  runs: runCount,
  full,
  verbose,
} = agreementOptions(process.argv.slice(2), process.env.OPENLOOP_AGREEMENT_RUNS)
const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const userId = 'user-alex'

const fixture = (await FixtureSource.load(path.join(repoRoot, 'demo', 'seed-inbox.json'))).fixture
const seedLedger = JSON.parse(
  await readFile(path.join(repoRoot, 'demo', 'seed-ledger.json'), 'utf8'),
)
const expected = (seedLedger.loops as unknown[]).map((l) => OpenLoop.parse(l))
const input = calibrationInput(fixture, expected, full)
console.log(
  `${full ? 'Full demo' : 'Calibration subset'}: ${input.threadIds.length} threads, ${runCount} run(s)`,
)
const model = loadModel()

const results: OpenLoop[][] = []
/** A thread that threw reads as a disagreement in the table below, so it has to be called out. */
let failedThreads = 0
for (let run = 1; run <= runCount; run++) {
  const source = FixtureSource.fromData(input.fixture)
  const store = new LocalLedgerStore()
  const specialists = createSpecialists({ model, source, store, userId })
  const started = Date.now()
  const summary = await runScan({
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
  if (summary.failed > 0) failedThreads += summary.failed
  console.log(
    `run ${run}/${runCount} done in ${Math.round((Date.now() - started) / 1000)}s${summary.failed > 0 ? `, ${summary.failed} threads failed` : ''}`,
  )
}

const report = compareRuns(input.expected, results, input.threadIds)
const width = Math.max(...report.rows.map((r) => r.threadId.length))
const header = report.rows[0]?.runs.map((_, i) => `run ${i + 1}`.padEnd(10)).join('') ?? ''
console.log(`\n${'thread'.padEnd(width)}  ${'expected'.padEnd(10)}${header}`)
for (const row of report.rows)
  console.log(
    `${row.threadId.padEnd(width)}  ${row.expected.padEnd(10)}${row.runs.map((c) => c.padEnd(10)).join('')}${row.agrees ? '✓' : '✗'}`,
  )
console.log(`\nagreement ${report.agreed}/${report.total} threads over ${report.runs} runs`)
if (failedThreads > 0)
  process.stderr.write(
    `${failedThreads} threads failed across ${runCount} runs; the agreement above is not calibration data\n`,
  )

if (failedThreads > 0 || report.agreed !== report.total) process.exitCode = 1
