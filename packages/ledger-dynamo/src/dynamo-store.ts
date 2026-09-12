import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  BatchWriteCommand,
  type BatchWriteCommandOutput,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import type {
  AuditEvent,
  Evidence,
  LedgerStore,
  LoopFilter,
  OpenLoop,
  ProposedAction,
  ProposedActionStatus,
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

type TableKey = { PK: string; SK: string }
type WriteRequests = NonNullable<BatchWriteCommandOutput['UnprocessedItems']>[string]

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
 * Status and source filters are applied in memory: a user has tens of loops, not millions.
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

  private async put(PK: string, SK: string, type: string, record: object): Promise<void> {
    await this.doc.send(
      new PutCommand({ TableName: this.table, Item: { PK, SK, type, ...record } }),
    )
  }

  private async get<T>(PK: string, SK: string): Promise<T | undefined> {
    const res = await this.doc.send(
      new GetCommand({ TableName: this.table, Key: { PK, SK }, ConsistentRead: true }),
    )
    return res.Item ? strip<T>(res.Item) : undefined
  }

  private async query<T>(
    PK: string,
    skPrefix: string,
    opts: { newestFirst?: boolean; limit?: number } = {},
  ): Promise<T[]> {
    const items: T[] = []
    let ExclusiveStartKey: Record<string, unknown> | undefined
    do {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.table,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: { ':pk': PK, ':sk': skPrefix },
          ScanIndexForward: !opts.newestFirst,
          ConsistentRead: true,
          ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}),
        }),
      )
      for (const item of res.Items ?? []) items.push(strip<T>(item))
      ExclusiveStartKey = res.LastEvaluatedKey
      if (opts.limit !== undefined && items.length >= opts.limit) break
    } while (ExclusiveStartKey)
    return items
  }

  async getLoop(userId: string, loopId: string): Promise<OpenLoop | undefined> {
    return this.get<OpenLoop>(this.userPk(userId), `LOOP#${loopId}`)
  }

  async putLoop(loop: OpenLoop): Promise<void> {
    await this.put(this.userPk(loop.userId), `LOOP#${loop.id}`, 'loop', loop)
  }

  async listLoops(userId: string, filter: LoopFilter = {}): Promise<OpenLoop[]> {
    const statuses = filter.status === undefined ? undefined : new Set([filter.status].flat())
    const loops = await this.query<OpenLoop>(this.userPk(userId), 'LOOP#')
    return loops
      .filter((l) => !statuses || statuses.has(l.status))
      .sort(
        (a, b) =>
          (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
          a.createdAt.localeCompare(b.createdAt),
      )
  }

  async findLoopsBySource(userId: string, sourceId: string): Promise<OpenLoop[]> {
    const loops = await this.query<OpenLoop>(this.userPk(userId), 'LOOP#')
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
    return this.query<Evidence>(this.loopPk(loopId), 'EVIDENCE#')
  }

  async putAction(action: ProposedAction): Promise<void> {
    await this.put(this.userPk(action.userId), `ACTION#${action.id}`, 'action', action)
  }

  async getAction(userId: string, actionId: string): Promise<ProposedAction | undefined> {
    return this.get<ProposedAction>(this.userPk(userId), `ACTION#${actionId}`)
  }

  async listActions(
    userId: string,
    filter: { loopId?: string; status?: ProposedActionStatus } = {},
  ): Promise<ProposedAction[]> {
    const actions = await this.query<ProposedAction>(this.userPk(userId), 'ACTION#')
    return actions
      .filter(
        (a) =>
          (filter.loopId === undefined || a.loopId === filter.loopId) &&
          (filter.status === undefined || a.status === filter.status),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    await this.put(this.userPk(event.userId), `AUDIT#${event.at}#${event.id}`, 'audit', event)
  }

  async listAudit(
    userId: string,
    opts: { loopId?: string; limit?: number } = {},
  ): Promise<AuditEvent[]> {
    const events = await this.query<AuditEvent>(this.userPk(userId), 'AUDIT#', {
      newestFirst: true,
      ...(opts.limit !== undefined && opts.loopId === undefined ? { limit: opts.limit } : {}),
    })
    const filtered = events.filter((e) => opts.loopId === undefined || e.loopId === opts.loopId)
    return opts.limit === undefined ? filtered : filtered.slice(0, opts.limit)
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
    const loops = await this.queryKeys(userPk, 'LOOP#')
    const actions = await this.queryKeys(userPk, 'ACTION#')
    const audit = await this.queryKeys(userPk, 'AUDIT#')
    const evidence: TableKey[] = []
    for (const key of loops) {
      const loopId = key.SK.slice('LOOP#'.length)
      evidence.push(...(await this.queryKeys(this.loopPk(loopId), 'EVIDENCE#')))
    }
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
    for (let i = 0; i < keys.length; i += BATCH_SIZE) {
      let pending: WriteRequests = keys
        .slice(i, i + BATCH_SIZE)
        .map((Key) => ({ DeleteRequest: { Key } }))
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
}

const LEGACY_MARKERS = new Set(['loop', 'evidence', 'audit'])

function strip<T>(item: Record<string, unknown>): T {
  const { PK: _pk, SK: _sk, _kind, ...rest } = item
  // Rows written before the `_kind` marker carried the marker in `type`; drop it only when it is a marker value.
  if (typeof rest.type === 'string' && LEGACY_MARKERS.has(rest.type)) delete rest.type
  return rest as T
}
