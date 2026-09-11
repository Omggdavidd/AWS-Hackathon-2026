import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { DynamoLedgerStore } from '@openloop/ledger-dynamo'
import { FixtureSource, type LedgerStore, LocalLedgerStore } from '@openloop/shared'
import { createSpecialists } from '../src/agents'
import { loadModel } from '../src/model'
import { runScan } from '../src/scan'

/**
 * Local runner: scan the demo fixtures with the real model into a local ledger.
 *   pnpm --filter @openloop/agent scan            # .openloop/agent-ledger.json at the repo root
 *   pnpm --filter @openloop/agent scan -- --reset # start from an empty ledger
 *   pnpm --filter @openloop/agent scan -- --dynamo openloop-ledger   # write to the DynamoDB table instead
 */
const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const reset = process.argv.includes('--reset')
const dynamoIdx = process.argv.indexOf('--dynamo')
const dynamoTable = dynamoIdx >= 0 ? process.argv[dynamoIdx + 1] : undefined
const ledgerPath = path.join(repoRoot, '.openloop', 'agent-ledger.json')
const userId = 'user-alex'

if (reset) await rm(ledgerPath, { force: true })
await mkdir(path.dirname(ledgerPath), { recursive: true })
const source = await FixtureSource.load(path.join(repoRoot, 'demo', 'seed-inbox.json'))
const store: LedgerStore = dynamoTable
  ? new DynamoLedgerStore({ tableName: dynamoTable })
  : await LocalLedgerStore.fromFile(ledgerPath)
const specialists = createSpecialists({ model: loadModel(), source, store, userId })

const started = Date.now()
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
