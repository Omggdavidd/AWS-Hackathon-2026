import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  BatchWriteCommand,
  type BatchWriteCommandOutput,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import {
  type AuditEvent,
  compareActionsByCreated,
  compareLoopsByDue,
  type Evidence,
  type LedgerStore,
  type LoopFilter,
  matchesActionFilter,
  matchesLoopFilter,
  type OpenLoop,
  type ProposedAction,
  type ProposedActionStatus,
  type PutLoopOptions,
  StaleLoopWriteError,
} from '@openloop/shared'

/** Rows deleted (or, for a dry run, found) by {@link DynamoLedgerStore.purgeUser}. */
export interface PurgeUserResult {
  loops: number
  actions: number
  audit: number
  evidence: number
}

/** BatchWriteItem accepts at most 25 requests per call. */
const BATCH_SIZE = 25
/** Retries of the items BatchWriteItem returns unprocessed, before giving up. */
const MAX_BATCH_ATTEMPTS = 8
/** Requests purgeUser keeps in flight. Enough to hide latency, small enough not to self-throttle. */
const PURGE_CONCURRENCY = 8
/**
 * Page size for a query that filters server-side. DynamoDB applies Limit to the rows it reads,
 * before the filter, so asking for exactly the rows still wanted would cost a round trip per match.
 */
const FILTERED_PAGE_SIZE = 100

type TableKey = { PK: string; SK: string }
type WriteRequests = NonNullable<BatchWriteCommandOutput['UnprocessedItems']>[string]
/** A server-side expression: used as a query's FilterExpression and as a put's condition. */
type QueryFilter = {
  expression: string
  names: Record<string, string>
  values: Record<string, unknown>
}

/**
 * What kind of record a row holds, and the marker value written into its `type` attribute.
 * `action` has none on purpose: ProposedAction owns `type` (`draft_email`, `pay`, …), so an action
 * row carries the record's own value and nothing is stripped on read. Giving it a marker here would
 * make strip() delete a real business field.
 */
const ROW_MARKER = {
  loop: 'loop',
  evidence: 'evidence',
  audit: 'audit',
  action: undefined,
} as const
type RowKind = keyof typeof ROW_MARKER

export interface DynamoLedgerStoreOptions {
  tableName: string
  region?: string
  endpoint?: string
  client?: DynamoDBClient
  /** Prepended to every partition key; used by tests to isolate runs in a shared table. */
  partitionPrefix?: string
}

/**
 * Single-table DynamoDB ledger (ADR-0009). Keys:
 *   USER#<userId>  LOOP#<loopId>                 one item per loop
 *   USER#<userId>  ACTION#<actionId>             one item per proposed action
 *   USER#<userId>  AUDIT#<at>#<id>               audit events, queried newest first
 *   LOOP#<loopId>  EVIDENCE#<observedAt>#<id>    evidence per loop, oldest first
 * Status and source filters are applied in memory: a user has tens of loops, not millions. The
 * audit partition is the exception; it only grows, so its filter and limit go to DynamoDB.
 * Reads are strongly consistent so the UI sees a write immediately (no secondary indexes, so this is allowed).
 */
export class DynamoLedgerStore implements LedgerStore {
  private readonly doc: DynamoDBDocumentClient
  private readonly table: string
  private readonly prefix: string

  constructor(opts: DynamoLedgerStoreOptions) {
    const client =
      opts.client ??
      new DynamoDBClient({
        region: opts.region ?? process.env.AWS_REGION ?? 'us-east-1',
        ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
      })
    this.doc = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    })
    this.table = opts.tableName
    this.prefix = opts.partitionPrefix ?? ''
  }

  private userPk(userId: string) {
    return `${this.prefix}USER#${userId}`
  }
  private loopPk(loopId: string) {
    return `${this.prefix}LOOP#${loopId}`
  }

  private async put(
    PK: string,
    SK: string,
    kind: RowKind,
    record: object,
    condition?: QueryFilter,
  ): Promise<void> {
    const marker = ROW_MARKER[kind]
    await this.doc.send(
      new PutCommand({
        TableName: this.table,
        Item: marker === undefined ? { PK, SK, ...record } : { PK, SK, type: marker, ...record },
        ...(condition
          ? {
              ConditionExpression: condition.expression,
              ExpressionAttributeNames: condition.names,
              ExpressionAttributeValues: condition.values,
            }
          : {}),
      }),
    )
  }

  private async get<T>(PK: string, SK: string, kind: RowKind): Promise<T | undefined> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK, SK }, ConsistentRead: true }),
    )
    return res.Item ? strip<T>(res.Item, kind) : undefined
  }

  private async query<T>(
    PK: string,
    skPrefix: string,
    kind: RowKind,
    opts: { newestFirst?: boolean; limit?: number; filter?: QueryFilter } = {},
  ): Promise<T[]> {
    if (opts.limit !== undefined && opts.limit <= 0) return []
    const items: T[] = []
    let ExclusiveStartKey: Record<string, unknown> | undefined
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': PK, ':sk': skPrefix, ...opts.filter?.values },
          ...(opts.filter
            ? {
                FilterExpression: opts.filter.expression,
                ExpressionAttributeNames: opts.filter.names,
              }
            : {}),
          ScanIndexForward: !opts.newestFirst,
          ConsistentRead: true,
          ...pageLimit(opts.limit, items.length, opts.filter !== undefined),
          ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
        }),
      )
      for (const item of res.Items ?? []) items.push(strip<T>(item, kind))
      ExclusiveStartKey = res.LastEvaluatedKey
      if (opts.limit !== undefined && items.length >= opts.limit) break
    } while (ExclusiveStartKey)
    // A filtered page can overshoot: it is sized to keep round trips down, not to the rows wanted.
    return opts.limit !== undefined && items.length > opts.limit
      ? items.slice(0, opts.limit)
      : items
  }

  async getLoop(userId: string, loopId: string): Promise<OpenLoop | undefined> {
    return this.get<OpenLoop>(this.userPk(userId), `LOOP#${loopId}`, 'loop')
  }

  /**
   * With `ifUnchanged`, the row is written under a ConditionExpression on its stored version.
   * Expecting 0 also accepts a row with no `version` attribute at all: the live table is full of
   * rows written before the field existed, and they have to be claimable exactly once. `version`
   * is a DynamoDB reserved word, hence the name placeholder.
   */
  async putLoop(loop: OpenLoop, opts: PutLoopOptions = {}): Promise<OpenLoop> {
    if (!opts.ifUnchanged) {
      await this.put(this.userPk(loop.userId), `LOOP#${loop.id}`, 'loop', loop)
      return loop
    }
    const expected = loop.version ?? 0
    const next = { ...loop, version: expected + 1 }
    try {
      await this.put(this.userPk(loop.userId), `LOOP#${loop.id}`, 'loop', next, {
        expression:
          expected === 0
            ? 'attribute_not_exists(PK) OR attribute_not_exists(#version) OR #version = :expected'
            : '#version = :expected',
        names: { '#version': 'version' },
        values: { ':expected': expected },
      })
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException)
        throw new StaleLoopWriteError(loop.id, expected)
      throw err
    }
    return next
  }

  async listLoops(userId: string, filter: LoopFilter = {}): Promise<OpenLoop[]> {
    const loops = await this.query<OpenLoop>(this.userPk(userId), 'LOOP#', 'loop')
    return loops.filter((l) => matchesLoopFilter(l, filter)).sort(compareLoopsByDue)
  }

  async findLoopsBySource(userId: string, sourceId: string): Promise<OpenLoop[]> {
    const loops = await this.query<OpenLoop>(this.userPk(userId), 'LOOP#', 'loop')
    return loops.filter((l) => l.sourceRefs.some((r) => r.sourceId === sourceId))
  }

  async appendEvidence(evidence: Evidence): Promise<void> {
    await this.put(
      this.loopPk(evidence.loopId),
      `EVIDENCE#${evidence.observedAt}#${evidence.id}`,
      'evidence',
      evidence,
    )
  }

  async listEvidence(loopId: string): Promise<Evidence[]> {
    return this.query<Evidence>(this.loopPk(loopId), 'EVIDENCE#', 'evidence')
  }

  async putAction(action: ProposedAction): Promise<void> {
    await this.put(this.userPk(action.userId), `ACTION#${action.id}`, 'action', action)
  }

  async getAction(userId: string, actionId: string): Promise<ProposedAction | undefined> {
    return this.get<ProposedAction>(this.userPk(userId), `ACTION#${actionId}`, 'action')
  }

  async listActions(
    userId: string,
    filter: { loopId?: string; status?: ProposedActionStatus } = {},
  ): Promise<ProposedAction[]> {
    const actions = await this.query<ProposedAction>(this.userPk(userId), 'ACTION#', 'action')
    return actions.filter((a) => matchesActionFilter(a, filter)).sort(compareActionsByCreated)
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    await this.put(this.userPk(event.userId), `AUDIT#${event.at}#${event.id}`, 'audit', event)
  }

  /**
   * Newest first, the SK order the partition is already in, so nothing is re-sorted here. The loop
   * filter goes to DynamoDB rather than running over the whole partition in memory; it is the same
   * rule as `matchesAuditFilter` in @openloop/shared, which LocalLedgerStore applies.
   */
  async listAudit(
    userId: string,
    opts: { loopId?: string; limit?: number } = {},
  ): Promise<AuditEvent[]> {
    return this.query<AuditEvent>(this.userPk(userId), 'AUDIT#', 'audit', {
      newestFirst: true,
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts.loopId !== undefined
        ? {
            filter: {
              expression: '#loopId = :loopId',
              names: { '#loopId': 'loopId' },
              values: { ':loopId': opts.loopId },
            },
          }
        : {}),
    })
  }

  /**
   * Delete every row this store can reach for one user: the USER#<userId> partition (loops, actions,
   * audit) plus the EVIDENCE rows of each loop found there. Destructive; only the demo reset script
   * (`pnpm reset-demo`) calls it, never the request path.
   * Loop ids are collected before anything is deleted, because evidence lives under LOOP#<loopId> and
   * that partition can no longer be found by query once its loop row is gone.
   * Limitation: this never scans the table, so rows a query from USER#<userId> cannot reach are left
   * alone: anything written under a different `partitionPrefix`, and evidence whose loop row is
   * already missing (orphans from earlier runs).
   */
  async purgeUser(userId: string, opts: { dryRun?: boolean } = {}): Promise<PurgeUserResult> {
    const userPk = this.userPk(userId)
    const [loops, actions, audit] = await Promise.all([
      this.queryKeys(userPk, 'LOOP#'),
      this.queryKeys(userPk, 'ACTION#'),
      this.queryKeys(userPk, 'AUDIT#'),
    ])
    const perLoop = await mapWithConcurrency(loops, PURGE_CONCURRENCY, (key) =>
      this.queryKeys(this.loopPk(key.SK.slice('LOOP#'.length)), 'EVIDENCE#'),
    )
    const evidence = perLoop.flat()
    const found: PurgeUserResult = {
      loops: loops.length,
      actions: actions.length,
      audit: audit.length,
      evidence: evidence.length,
    }
    if (opts.dryRun) return found
    await this.deleteKeys([...evidence, ...loops, ...actions, ...audit])
    return found
  }

  /** Keys only (the public list* methods drop PK and SK, so their output cannot feed a delete). */
  private async queryKeys(PK: string, skPrefix: string): Promise<TableKey[]> {
    const keys: TableKey[] = []
    let ExclusiveStartKey: Record<string, unknown> | undefined
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': PK, ':sk': skPrefix },
          ProjectionExpression: 'PK,SK',
          ConsistentRead: true,
          ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
        }),
      )
      for (const item of res.Items ?? []) keys.push({ PK: String(item.PK), SK: String(item.SK) })
      ExclusiveStartKey = res.LastEvaluatedKey
    } while (ExclusiveStartKey)
    return keys
  }

  private async deleteKeys(keys: TableKey[]): Promise<void> {
    const batches: WriteRequests[] = []
    for (let i = 0; i < keys.length; i += BATCH_SIZE)
      batches.push(keys.slice(i, i + BATCH_SIZE).map((Key) => ({ DeleteRequest: { Key } })))
    await mapWithConcurrency(batches, PURGE_CONCURRENCY, (batch) => this.writeBatch(batch))
  }

  private async writeBatch(batch: WriteRequests): Promise<void> {
    let pending = batch
    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt >= MAX_BATCH_ATTEMPTS)
        throw new Error(
          `${pending.length} rows still unprocessed after ${MAX_BATCH_ATTEMPTS} batch writes`,
        )
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt))
      const res = await this.doc.send(
        new BatchWriteCommand({ RequestItems: { [this.table]: pending } }),
      )
      pending = res.UnprocessedItems?.[this.table] ?? []
    }
  }
}

/** How many rows to ask DynamoDB for on the next page, if the caller set a limit at all. */
function pageLimit(limit: number | undefined, have: number, filtered: boolean) {
  if (limit === undefined) return {}
  const remaining = limit - have
  return { Limit: filtered ? Math.max(remaining, FILTERED_PAGE_SIZE) : remaining }
}

function strip<T>(item: Record<string, unknown>, kind: RowKind): T {
  const { PK: _pk, SK: _sk, ...rest } = item
  // `type` on a marked row is put()'s marker, never part of the record; see ROW_MARKER.
  if (ROW_MARKER[kind] !== undefined) delete rest.type
  return rest as T
}

/** Run fn over items with at most `limit` in flight, results in input order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      out[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
