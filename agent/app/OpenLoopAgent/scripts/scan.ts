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
import { catchUp } from '../src/catch-up'
import { loadModel } from '../src/model'
import { runScan } from '../src/scan'

/**
 * Local runner: scan the demo fixtures with the real model into a local ledger.
 *   pnpm --filter @openloop/agent scan            # .openloop/agent-ledger.json at the repo root
 *   pnpm --filter @openloop/agent scan -- --reset # start from an empty ledger
 *   pnpm --filter @openloop/agent scan -- --dynamo openloop-ledger   # write to the DynamoDB table instead
 *   pnpm --filter @openloop/agent scan -- --delta                     # next-morning batch on top of the base inbox
 *   pnpm --filter @openloop/agent scan -- --handle                    # execute every allowed proposed action instead of scanning
 *   pnpm --filter @openloop/agent scan -- --catch-up                  # summarize what changed since the last catch-up
 */
const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const reset = process.argv.includes('--reset')
const delta = process.argv.includes('--delta')
const handle = process.argv.includes('--handle')
const catchUpFlag = process.argv.includes('--catch-up')
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
const specialists = createSpecialists({ model: loadModel(), source, store, userId })

const started = Date.now()
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
    now: source.fixture.persona.now,
  })
  for (const h of result.handled) console.log(`✓ ${h.status.padEnd(9)} ${h.summary}`)
  for (const n of result.needsYou) console.log(`→ needs you: ${n.summary} (${n.reason})`)
  console.log(
    `\nhandled ${result.handled.length}, needs you ${result.needsYou.length}, in ${Math.round((Date.now() - started) / 1000)}s`,
  )
  process.exit(0)
}
const summary = await runScan({
  source,
  store,
  userId,
  specialists,
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
