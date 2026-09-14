import {
  DynamoDBClient,
  GetItemCommand,
  type GetItemCommandOutput,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb'

export const RUNTIME_MODES = ['open', 'demo', 'locked'] as const
export type RuntimeMode = (typeof RUNTIME_MODES)[number]

const RANK: Record<RuntimeMode, number> = { open: 0, demo: 1, locked: 2 }
const CACHE_MS = 10_000
const cache = new Map<string, { mode: RuntimeMode; until: number }>()
let sharedClient: DynamoDBClient | undefined

export function parseRuntimeMode(value: string | undefined): RuntimeMode {
  return RUNTIME_MODES.includes(value as RuntimeMode) ? (value as RuntimeMode) : 'open'
}

function storedMode(value: string | undefined): RuntimeMode | undefined {
  return RUNTIME_MODES.includes(value as RuntimeMode) ? (value as RuntimeMode) : undefined
}

export function tighterMode(a: RuntimeMode, b: RuntimeMode): RuntimeMode {
  return RANK[a] >= RANK[b] ? a : b
}

export interface RuntimeLockOptions {
  tableName: string
  defaultMode?: RuntimeMode
  client?: DynamoDBClient
  now?: number
}

/**
 * Read the deployment's model-call mode. The environment is the safety floor: a table row may
 * tighten it, never loosen it. A failed read falls back to that floor, so a DynamoDB blip can
 * neither invent a lock nor silently undo one. Results are cached per table/floor for ten seconds.
 */
export async function getRuntimeMode({
  tableName,
  defaultMode = 'open',
  client,
  now = Date.now(),
}: RuntimeLockOptions): Promise<RuntimeMode> {
  const key = `${tableName}\0${defaultMode}`
  const hit = cache.get(key)
  if (hit && hit.until > now) return hit.mode

  let mode = defaultMode
  try {
    const res: GetItemCommandOutput = await (client ?? getClient()).send(
      new GetItemCommand({
        TableName: tableName,
        Key: { PK: { S: 'CONFIG' }, SK: { S: 'RUNTIME_LOCK' } },
        ConsistentRead: true,
      }),
    )
    const stored = storedMode(res.Item?.mode?.S)
    if (stored) mode = tighterMode(defaultMode, stored)
  } catch {
    mode = defaultMode
  }
  cache.set(key, { mode, until: now + CACHE_MS })
  return mode
}

/** Write the requested row. Callers own authorization; the environment floor still wins on reads. */
export async function putRuntimeMode(
  tableName: string,
  mode: RuntimeMode,
  client: DynamoDBClient = getClient(),
): Promise<void> {
  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        PK: { S: 'CONFIG' },
        SK: { S: 'RUNTIME_LOCK' },
        mode: { S: mode },
        updatedAt: { S: new Date().toISOString() },
      },
    }),
  )
  clearRuntimeModeCache(tableName)
}

export function clearRuntimeModeCache(tableName?: string): void {
  if (!tableName) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) if (key.startsWith(`${tableName}\0`)) cache.delete(key)
}

function getClient(): DynamoDBClient {
  sharedClient ??= new DynamoDBClient({
    region: process.env.AWS_REGION ?? 'us-east-1',
    maxAttempts: 2,
    requestHandler: { connectionTimeout: 1000, requestTimeout: 2000 },
  })
  return sharedClient
}
