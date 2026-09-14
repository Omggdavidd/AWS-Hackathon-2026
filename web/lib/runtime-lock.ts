import 'server-only'
import {
  getRuntimeMode,
  parseRuntimeMode,
  putRuntimeMode,
  type RuntimeMode,
} from '@openloop/ledger-dynamo'
import { LEDGER_TABLE } from './ledger'

export const LOCK_DEFAULT = parseRuntimeMode(process.env.OPENLOOP_LOCK_DEFAULT)
export const PAUSED_MESSAGE =
  'The agent is paused. Loops below are real results from the last scan.'
/**
 * Whether the Settings controls do anything, the way `scanConfigured` gates the agent buttons.
 * Pausing is public, so a deployment without the key could be paused by anyone and resumed by
 * nobody; until one is set the controls are inert. `OPENLOOP_LOCK_DEFAULT` and a row written
 * outside the app still pause the runtime.
 */
export const lockConfigured = Boolean(process.env.OPENLOOP_UNLOCK_KEY)

export async function readRuntimeMode(): Promise<RuntimeMode> {
  if (!LEDGER_TABLE) return LOCK_DEFAULT
  return getRuntimeMode({ tableName: LEDGER_TABLE, defaultMode: LOCK_DEFAULT })
}

export async function writeRuntimeMode(mode: RuntimeMode): Promise<void> {
  if (!LEDGER_TABLE) throw new Error('OPENLOOP_LEDGER_TABLE is required to change the runtime mode')
  await putRuntimeMode(LEDGER_TABLE, mode)
}

export async function requireRuntimeOpen(): Promise<void> {
  const mode = await readRuntimeMode()
  if (mode !== 'open') throw new Error(PAUSED_MESSAGE)
}
