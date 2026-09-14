import { randomUUID } from 'node:crypto'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore'
import {
  createLockClient,
  DynamoLedgerStore,
  getRuntimeMode,
  parseRuntimeMode,
} from '@openloop/ledger-dynamo'
import { LocalLedgerStore } from '@openloop/shared'

/**
 * Put the demo back in a known state: delete the demo user's rows from the ledger table, then rescan
 * the base inbox into it through the deployed runtime (about 95 to 105 seconds). Deletes nothing unless --table
 * names the target table exactly and --yes confirms.
 *   pnpm reset-demo --dry-run                                     # count what would go, delete nothing
 *   pnpm reset-demo --table openloop-ledger --yes                 # delete, then scan through the deployed runtime
 *   pnpm reset-demo --table openloop-ledger --yes --no-scan       # delete only (no AWS Bedrock call)
 *   pnpm reset-demo --table openloop-ledger --yes --user user-bo  # another user id (default user-alex, or OPENLOOP_USER_ID)
 *   pnpm reset-demo --local --yes                                 # reseed the local JSON ledger from demo/seed-ledger.json instead (whole file, rejects --user)
 *   OPENLOOP_LEDGER_TABLE, AWS_REGION, DYNAMODB_ENDPOINT, OPENLOOP_RUNTIME_ARN, OPENLOOP_LEDGER_FILE override the rest
 */
const local = process.argv.includes('--local')
const dryRun = process.argv.includes('--dry-run')
const confirmed = process.argv.includes('--yes')
const scanAfter = !process.argv.includes('--no-scan')
const userIdx = process.argv.indexOf('--user')
const namedUser = userIdx >= 0 ? process.argv[userIdx + 1] : undefined
const envUser = process.env.OPENLOOP_USER_ID
const userId = namedUser ?? envUser ?? 'user-alex'
const tableIdx = process.argv.indexOf('--table')
const namedTable = tableIdx >= 0 ? process.argv[tableIdx + 1] : undefined
const table = process.env.OPENLOOP_LEDGER_TABLE ?? 'openloop-ledger'
const region = process.env.AWS_REGION ?? 'us-east-1'
const endpoint = process.env.DYNAMODB_ENDPOINT
const runtimeArn = process.env.OPENLOOP_RUNTIME_ARN
const repoRoot = path.resolve(import.meta.dirname, '../../../..')
const seedFile = path.join(repoRoot, 'demo', 'seed-ledger.json')
const ledgerFile =
  process.env.OPENLOOP_LEDGER_FILE ?? path.join(repoRoot, '.openloop', 'ledger.json')

/** Repo-relative when the file is in the repo, absolute when it is not. */
const show = (file: string) => (file.startsWith(repoRoot) ? path.relative(repoRoot, file) : file)

/** "4 needs you, 3 watching" for the closing summary. */
function byStatus(statuses: string[]): string {
  const counts = new Map<string, number>()
  for (const status of statuses) counts.set(status, (counts.get(status) ?? 0) + 1)
  return [...counts]
    .map(([status, n]) => `${n} ${status.toLowerCase().replace('_', ' ')}`)
    .join(', ')
}

if (local) {
  const seed = await LocalLedgerStore.fromFile(seedFile)
  const seedUsers = [...new Set(seed.snapshot().loops.map((l) => l.userId))]
  const [seedUser] = seedUsers
  if (!seedUser || seedUsers.length > 1) {
    console.log(
      `refusing to reseed: ${show(seedFile)} must hold exactly one user id, found ${seedUsers.join(', ') || 'none'}`,
    )
    process.exit(1)
  }
  if (namedUser !== undefined) {
    console.log(
      `refusing to reseed: --user ${namedUser} asks for one user, but --local overwrites the whole ledger with ${show(seedFile)}, which holds only ${seedUser}; drop --user, or reset ${namedUser} against the table`,
    )
    process.exit(1)
  }
  if (envUser !== undefined && envUser !== seedUser) {
    console.log(
      `refusing to reseed: OPENLOOP_USER_ID is ${envUser}, but --local overwrites the whole ledger with ${show(seedFile)}, which holds only ${seedUser}, so it cannot produce ${envUser}'s ledger; unset it, or reset ${envUser} against the table`,
    )
    process.exit(1)
  }
  const before = await LocalLedgerStore.fromFile(ledgerFile)
  const snap = before.snapshot()
  console.log(`▸ local ledger  ${show(ledgerFile)}  user ${userId}`)
  console.log(
    `  now: ${snap.loops.length} loops, ${snap.actions.length} actions, ${snap.audit.length} audit events, ${snap.evidence.length} evidence`,
  )
  console.log(`  reset overwrites the whole file with ${show(seedFile)}`)
  if (dryRun) {
    console.log('dry run: nothing written')
    process.exit(0)
  }
  if (!confirmed) {
    console.log('refusing to overwrite without --yes')
    process.exit(1)
  }
  await mkdir(path.dirname(ledgerFile), { recursive: true })
  await copyFile(seedFile, ledgerFile)
  const after = await LocalLedgerStore.fromFile(ledgerFile)
  const loops = await after.listLoops(userId)
  console.log(
    `✓ reseeded: ${loops.length} loops for ${userId} (${byStatus(loops.map((l) => l.status))})`,
  )
  process.exit(0)
}

if (scanAfter && !runtimeArn) {
  console.log(
    'OPENLOOP_RUNTIME_ARN is not set: get it from `agentcore status --json`, or pass --no-scan to only clear the table',
  )
  process.exit(1)
}

const store = new DynamoLedgerStore({
  tableName: table,
  region,
  ...(endpoint ? { endpoint } : {}),
})
console.log(
  `▸ table ${table}  region ${region}${endpoint ? `  endpoint ${endpoint}` : ''}  user ${userId}`,
)
/**
 * The rescan goes through the runtime, which refuses every command while the lock is anything but
 * open. Read the lock before deleting anything: otherwise the reset empties the table, the scan
 * writes nothing and the run still exits 0.
 */
if (scanAfter) {
  const mode = await getRuntimeMode({
    tableName: table,
    defaultMode: parseRuntimeMode(process.env.OPENLOOP_LOCK_DEFAULT),
    client: createLockClient({ region, ...(endpoint ? { endpoint } : {}) }),
  })
  if (mode !== 'open') {
    console.log(
      `refusing to delete anything: the agent is paused (${mode}), so the rescan would write nothing. Resume it in Settings, or pass --no-scan to clear the table without one.`,
    )
    process.exit(1)
  }
}
const found = await store.purgeUser(userId, { dryRun: true })
const total = found.loops + found.actions + found.audit + found.evidence
console.log(
  `  to delete: ${found.loops} loops, ${found.actions} actions, ${found.audit} audit events, ${found.evidence} evidence rows (${total} rows)`,
)
console.log(
  '  not reached: rows under another partition prefix, and evidence whose loop row is already gone (orphans from earlier runs)',
)
if (dryRun) {
  console.log('dry run: nothing deleted')
  process.exit(0)
}
if (!confirmed) {
  console.log(`refusing to delete ${total} rows without --yes`)
  process.exit(1)
}
if (namedTable !== table) {
  console.log(
    `refusing to delete ${total} rows: --table must name the target table, expected ${table}, got ${namedTable ?? 'no --table'}`,
  )
  process.exit(1)
}
const deleted = await store.purgeUser(userId)
console.log(
  `✓ deleted ${deleted.loops} loops, ${deleted.actions} actions, ${deleted.audit} audit events, ${deleted.evidence} evidence rows`,
)
if (!scanAfter) process.exit(0)

console.log(`▸ scanning the base inbox on the runtime into ${table}, about 95 to 105 seconds…`)
const started = Date.now()
const client = new BedrockAgentCoreClient({ region })
const res = await client.send(
  new InvokeAgentRuntimeCommand({
    agentRuntimeArn: runtimeArn,
    runtimeSessionId: `reset-${userId}-${randomUUID()}`,
    contentType: 'application/json',
    accept: 'text/event-stream',
    payload: new TextEncoder().encode(
      JSON.stringify({
        command: 'scan',
        userId,
        source: { kind: 'fixture', variant: 'base' },
        ledger: { kind: 'dynamo', table },
      }),
    ),
  }),
)
const body = res.response
if (!body) throw new Error('empty response from the runtime')
const reader = body.transformToWebStream().getReader()
const decoder = new TextDecoder()
let buffer = ''
for (;;) {
  const { value, done } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const parts = buffer.split('\n')
  buffer = parts.pop() ?? ''
  for (const line of parts) report(line)
}
report(buffer)

const loops = await store.listLoops(userId)
console.log(
  `\n✓ ${loops.length} loops for ${userId} in ${table} (${byStatus(loops.map((l) => l.status))})  in ${Math.round((Date.now() - started) / 1000)}s`,
)

/** The runtime's SSE events, same shapes the web's scan button reads. */
type ScanEvent =
  | { type: 'thread'; threadId: string; subject: string }
  | { type: 'skipped'; threadId: string; reason: string }
  | { type: 'loop'; loop: { title: string; status: string }; actions: number }
  | { type: 'updated'; loop: { title: string }; from: string; to: string }
  | {
      type: 'summary'
      summary: { threads: number; created: number; updated: number; skipped: number }
    }

function report(line: string): void {
  if (line.startsWith('event: error')) throw new Error('the runtime reported an error')
  if (!line.startsWith('data: ')) return
  let event: ScanEvent
  try {
    const first = JSON.parse(line.slice(6))
    event = typeof first === 'string' ? (JSON.parse(first) as ScanEvent) : (first as ScanEvent)
  } catch {
    return
  }
  if (event.type === 'thread') console.log(`  ▸ ${event.subject}`)
  else if (event.type === 'skipped') console.log(`    skipped: ${event.reason}`)
  else if (event.type === 'loop')
    console.log(
      `    ${event.loop.status.padEnd(9)} ${event.loop.title}  (${event.actions} actions)`,
    )
  else if (event.type === 'updated')
    console.log(`    ${event.loop.title}: ${event.from} → ${event.to}`)
  else if (event.type === 'summary')
    console.log(
      `  ${event.summary.created} created, ${event.summary.updated} updated, ${event.summary.skipped} skipped, from ${event.summary.threads} threads`,
    )
}
