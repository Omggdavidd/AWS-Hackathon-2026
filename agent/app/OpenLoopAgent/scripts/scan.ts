import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { DynamoLedgerStore } from '@openloop/ledger-dynamo'
import {
  FixtureActionSink,
  FixtureSource,
  type LedgerStore,
  LocalLedgerStore,
} from '@openloop/shared'
import { handleWhatYouCan } from '../src/actions'
import { createSpecialists } from '../src/agents'
import { ask } from '../src/ask'
import { catchUp } from '../src/catch-up'
import { jsonLogger, noopLogger } from '../src/log'
import { loadModel, loadModelsByRole } from '../src/model'
import { runScan } from '../src/scan'

/**
 * Local runner: scan the demo fixtures with the real model into a local ledger.
 *   pnpm --filter @openloop/agent scan            # .openloop/agent-ledger.json at the repo root
 *   pnpm --filter @openloop/agent scan -- --reset # start from an empty ledger
 *   pnpm --filter @openloop/agent scan -- --dynamo openloop-ledger   # write to the DynamoDB table instead
 *   pnpm --filter @openloop/agent scan -- --delta                     # next-morning batch on top of the base inbox
 *   pnpm --filter @openloop/agent scan -- --handle                    # execute every allowed proposed action instead of scanning
 *   pnpm --filter @openloop/agent scan -- --catch-up                  # summarize what changed since the last catch-up
 *   pnpm --filter @openloop/agent scan -- --ask "what am I waiting on?"  # answer one question from the ledger, read-only
 *   pnpm --filter @openloop/agent scan -- --log-json                  # the runtime's structured pipeline lines on stderr (#30)
 */
const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const reset = process.argv.includes('--reset')
const delta = process.argv.includes('--delta')
const handle = process.argv.includes('--handle')
const catchUpFlag = process.argv.includes('--catch-up')
const askIdx = process.argv.indexOf('--ask')
const question = askIdx >= 0 ? process.argv[askIdx + 1] : undefined
// stderr, so the pipeline lines never interleave with the human-readable progress on stdout.
const logger = process.argv.includes('--log-json')
  ? jsonLogger((chunk) => void process.stderr.write(chunk))
  : noopLogger
const dynamoIdx = process.argv.indexOf('--dynamo')
const dynamoTable = dynamoIdx >= 0 ? process.argv[dynamoIdx + 1] : undefined
const ledgerPath = path.join(repoRoot, '.openloop', 'agent-ledger.json')
const userId = 'user-alex'

if (reset) await rm(ledgerPath, { force: true })
await mkdir(path.dirname(ledgerPath), { recursive: true })
const base = (await FixtureSource.load(path.join(repoRoot, 'demo', 'seed-inbox.json'))).fixture
const source = delta
  ? FixtureSource.fromDataWithDelta(
      base,
      (await FixtureSource.load(path.join(repoRoot, 'demo', 'seed-inbox-delta.json'))).fixture,
    )
  : FixtureSource.fromData(base)
const store: LedgerStore = dynamoTable
  ? new DynamoLedgerStore({ tableName: dynamoTable })
  : await LocalLedgerStore.fromFile(ledgerPath)
const model = loadModel()
const specialists = createSpecialists({
  model,
  models: loadModelsByRole(model),
  source,
  store,
  userId,
})

/**
 * A run's product is the ledger. A thread or action that did not land is a responsibility the user
 * believes is tracked and is not, so it has to reach the caller as a non-zero exit, not just stdout.
 */
function fail(message: string): never {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const started = Date.now()
if (askIdx >= 0) {
  if (!question) throw new Error('--ask needs a question in quotes')
  const a = await ask({ store, userId, question, specialists, now: source.fixture.persona.now })
  console.log(`\n${a.answer}\n`)
  for (const r of a.references) console.log(`  ${r.title} (${r.loopId}) ${r.sourceIds.join(', ')}`)
  console.log(
    `\nsuggests: ${a.suggests}, confidence ${a.confidence}, in ${Math.round((Date.now() - started) / 1000)}s`,
  )
  process.exit(0)
}
if (catchUpFlag) {
  const s = await catchUp({ store, userId, specialists, now: source.fixture.persona.now })
  console.log(`\n${s.headline}\n`)
  for (const i of s.items) console.log(`  [${i.kind}] ${i.title}: ${i.text}`)
  console.log(
    `\nsince ${s.since}, nothing else: ${s.nothingElse}, in ${Math.round((Date.now() - started) / 1000)}s`,
  )
  process.exit(0)
}
if (handle) {
  const result = await handleWhatYouCan({
    store,
    source,
    sink: new FixtureActionSink(),
    userId,
    specialists,
    logger,
    now: source.fixture.persona.now,
  })
  const failedActions = result.handled.filter((h) => h.status === 'FAILED')
  for (const h of result.handled)
    console.log(`${h.status === 'FAILED' ? '✗' : '✓'} ${h.status.padEnd(9)} ${h.summary}`)
  for (const n of result.needsYou) console.log(`→ needs you: ${n.summary} (${n.reason})`)
  console.log(
    `\nhandled ${result.handled.length}, needs you ${result.needsYou.length}${failedActions.length > 0 ? `, failed ${failedActions.length}` : ''}, in ${Math.round((Date.now() - started) / 1000)}s`,
  )
  if (failedActions.length > 0)
    fail(
      `${failedActions.length} of ${result.handled.length} actions failed; those loops were not acted on`,
    )
  process.exit(0)
}
const summary = await runScan({
  source,
  store,
  userId,
  specialists,
  logger,
  now: source.fixture.persona.now,
  onEvent: (e) => {
    if (e.type === 'thread') process.stdout.write(`\n▸ ${e.threadId}  ${e.subject}\n`)
    else if (e.type === 'skipped') process.stdout.write(`  skipped: ${e.reason}\n`)
    else if (e.type === 'loop')
      process.stdout.write(
        `  ${e.loop.status.padEnd(9)} ${e.loop.priority.padEnd(8)} ${e.loop.title}  (${e.actions} actions)\n`,
      )
  },
})
console.log(
  `\n${JSON.stringify(summary)}  in ${Math.round((Date.now() - started) / 1000)}s  ledger: ${dynamoTable ?? path.relative(repoRoot, ledgerPath)}`,
)
if (summary.failed > 0)
  fail(
    `${summary.failed} of ${summary.threads} threads failed; the ledger is missing what they would have tracked`,
  )
