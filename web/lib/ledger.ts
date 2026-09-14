import 'server-only'
import { access, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { DynamoLedgerStore } from '@openloop/ledger-dynamo'
import { type LedgerStore, LocalLedgerStore } from '@openloop/shared'
import { DEMO_NAME } from './profile'

/** Single demo user until auth exists (architecture §6). */
export const USER_ID = 'user-alex'
export const USER_NAME = DEMO_NAME

const repoRoot = process.env.OPENLOOP_REPO_ROOT ?? path.resolve(process.cwd(), '..')
const ledgerFile =
  process.env.OPENLOOP_LEDGER_FILE ?? path.join(repoRoot, '.openloop', 'ledger.json')
const seedFile = path.join(repoRoot, 'demo', 'seed-ledger.json')

/** The DynamoDB table shared with the agent, when configured (ADR-0009). */
export const LEDGER_TABLE = process.env.OPENLOOP_LEDGER_TABLE

let storePromise: Promise<LedgerStore> | undefined

/**
 * The ledger the UI reads and writes. DynamoDB when OPENLOOP_LEDGER_TABLE is set; otherwise a local
 * JSON file seeded from the expected demo ledger so the dashboard is populated without the agent.
 * On a Vercel production deployment the local file is not an option: an unset table throws.
 */
export function getStore(): Promise<LedgerStore> {
  storePromise ??= open()
  return storePromise
}

/**
 * Put the demo back to its start (#29 from the web): on the shared table, delete every row the
 * demo user can reach, so the next scan rebuilds them; locally, reseed the JSON file from the
 * expected ledger. Returns what was done, for the settings page to say.
 */
export async function resetLedger(userId: string): Promise<string> {
  const store = await getStore()
  if (store instanceof DynamoLedgerStore) {
    const gone = await store.purgeUser(userId)
    return `Cleared ${gone.loops} loops, ${gone.actions} actions and ${gone.audit} notes from ${LEDGER_TABLE}. Run Scan inbox to rebuild them.`
  }
  await mkdir(path.dirname(ledgerFile), { recursive: true })
  await copyFile(seedFile, ledgerFile)
  storePromise = undefined
  const fresh = await getStore()
  const loops = await fresh.listLoops(userId)
  return `Reseeded ${loops.length} loops from the demo ledger.`
}

async function open(): Promise<LedgerStore> {
  if (LEDGER_TABLE) return new DynamoLedgerStore({ tableName: LEDGER_TABLE })
  // A production deployment with no table would serve the seeded demo ledger and look healthy.
  // VERCEL_ENV, not NODE_ENV: `next build` and `next start` set NODE_ENV=production locally too.
  if (process.env.VERCEL_ENV === 'production')
    throw new Error(
      'OPENLOOP_LEDGER_TABLE is not set. In production the app reads the DynamoDB ledger it shares ' +
        'with the agent and never falls back to the demo file. Set OPENLOOP_LEDGER_TABLE (and ' +
        'OPENLOOP_RUNTIME_ARN) in the Vercel project environment and redeploy.',
    )
  const exists = await access(ledgerFile).then(
    () => true,
    () => false,
  )
  if (!exists || process.env.OPENLOOP_RESET === '1') {
    await mkdir(path.dirname(ledgerFile), { recursive: true })
    await copyFile(seedFile, ledgerFile)
  }
  return LocalLedgerStore.fromFile(ledgerFile)
}
