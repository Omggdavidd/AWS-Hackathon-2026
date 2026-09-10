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

/**
 * The ledger adapter (ADR-0004, ADR-0009). Two implementations: LocalLedgerStore (in-process,
 * optional JSON file) and DynamoLedgerStore (AWS). Both must pass the shared contract test in
 * test/store-contract.ts. Records are validated by the caller with the Zod schemas before they
 * reach the store; the store treats them as opaque and never mutates them.
 */
export interface LedgerStore {
  getLoop(userId: string, loopId: string): Promise<OpenLoop | undefined>
  putLoop(loop: OpenLoop): Promise<void>
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
