import type {
  AuditEvent,
  Evidence,
  LoopStatus,
  OpenLoop,
  ProposedAction,
  ProposedActionStatus,
} from '../schemas/index'

export interface LoopFilter {
  status?: LoopStatus | LoopStatus[]
}

export interface PutLoopOptions {
  /**
   * Compare and swap instead of overwriting (ADR-0015): write only while the stored loop is still
   * at the version the caller read, then bump it. A caller that lost throws StaleLoopWriteError.
   */
  ifUnchanged?: boolean
}

/**
 * A compare-and-swap write that lost: someone else wrote the loop between the caller's read and
 * its write (ADR-0015). Distinct from every other store failure so a caller can re-read, reapply
 * its change and try again, rather than retrying a write that will never succeed.
 */
export class StaleLoopWriteError extends Error {
  constructor(
    readonly loopId: string,
    readonly expectedVersion: number,
  ) {
    super(`Loop ${loopId} changed since it was read at version ${expectedVersion}`)
    this.name = 'StaleLoopWriteError'
  }
}

/**
 * The ledger adapter (ADR-0004, ADR-0009). Two implementations: LocalLedgerStore (in-process,
 * optional JSON file) and DynamoLedgerStore (AWS). Both must pass the shared contract test in
 * test/store-contract.ts. Records are validated by the caller with the Zod schemas before they
 * reach the store; the store treats them as opaque and never mutates them.
 */
export interface LedgerStore {
  getLoop(userId: string, loopId: string): Promise<OpenLoop | undefined>
  /**
   * Write a loop and return the record as stored. Without options this overwrites whatever is
   * there, the behaviour every caller has today; with `ifUnchanged` it is a compare and swap on
   * `loop.version` (absent counts as 0, so a row written before versions existed can be claimed
   * once) and the returned record carries the bumped version. Overwrites do not touch the version,
   * so the guard only holds between callers that opt in.
   */
  putLoop(loop: OpenLoop, opts?: PutLoopOptions): Promise<OpenLoop>
  listLoops(userId: string, filter?: LoopFilter): Promise<OpenLoop[]>
  /** Loops whose sourceRefs include the given source id; used for deduplication. */
  findLoopsBySource(userId: string, sourceId: string): Promise<OpenLoop[]>

  appendEvidence(evidence: Evidence): Promise<void>
  listEvidence(loopId: string): Promise<Evidence[]>

  putAction(action: ProposedAction): Promise<void>
  getAction(userId: string, actionId: string): Promise<ProposedAction | undefined>
  listActions(
    userId: string,
    filter?: { loopId?: string; status?: ProposedActionStatus },
  ): Promise<ProposedAction[]>

  appendAudit(event: AuditEvent): Promise<void>
  listAudit(userId: string, opts?: { loopId?: string; limit?: number }): Promise<AuditEvent[]>
}
