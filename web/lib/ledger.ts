import 'server-only'
import { access, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { type LedgerStore, LocalLedgerStore } from '@openloop/shared'

/** Single demo user until auth exists (architecture §6). */
export const USER_ID = 'user-alex'
export const USER_NAME = 'Alex'

const repoRoot = process.env.OPENLOOP_REPO_ROOT ?? path.resolve(process.cwd(), '..')
const ledgerFile =
  process.env.OPENLOOP_LEDGER_FILE ?? path.join(repoRoot, '.openloop', 'ledger.json')
const seedFile = path.join(repoRoot, 'demo', 'seed-ledger.json')

let storePromise: Promise<LedgerStore> | undefined

/**
 * The ledger the UI reads and writes. Local JSON today (ADR-0009 local adapter), seeded from the
 * expected demo ledger on first run so the dashboard is populated before the agent exists.
 */
export function getStore(): Promise<LedgerStore> {
  storePromise ??= open()
  return storePromise
}

async function open(): Promise<LedgerStore> {
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
