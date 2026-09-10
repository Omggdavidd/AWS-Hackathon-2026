import { readFile, writeFile } from 'node:fs/promises'
import type {
  AuditEvent,
  Evidence,
  OpenLoop,
  ProposedAction,
  ProposedActionStatus,
} from '../schemas/index'
import type { LedgerStore, LoopFilter } from './store'

interface Snapshot {
  loops: OpenLoop[]
  evidence: Evidence[]
  actions: ProposedAction[]
  audit: AuditEvent[]
}

/**
 * In-process ledger for tests, `agentcore dev` and the seeded demo. Optionally persists to a
 * JSON file after every write so a dev server survives restarts. Not for concurrent processes.
 */
export class LocalLedgerStore implements LedgerStore {
  private loops = new Map<string, OpenLoop>()
  private evidence = new Map<string, Evidence[]>()
  private actions = new Map<string, ProposedAction>()
  private audit: AuditEvent[] = []

  constructor(private readonly filePath?: string) {}

  static async fromFile(filePath: string): Promise<LocalLedgerStore> {
    const store = new LocalLedgerStore(filePath)
    try {
      const raw = await readFile(filePath, 'utf8')
      const snap = JSON.parse(raw) as Snapshot
      for (const l of snap.loops ?? []) store.loops.set(l.id, l)
      for (const e of snap.evidence ?? [])
        store.evidence.set(e.loopId, [...(store.evidence.get(e.loopId) ?? []), e])
      for (const a of snap.actions ?? []) store.actions.set(a.id, a)
      store.audit = snap.audit ?? []
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    return store
  }

  snapshot(): Snapshot {
    return {
      loops: [...this.loops.values()],
      evidence: [...this.evidence.values()].flat(),
      actions: [...this.actions.values()],
      audit: [...this.audit],
    }
  }

  private async persist(): Promise<void> {
    if (!this.filePath) return
    await writeFile(this.filePath, JSON.stringify(this.snapshot(), null, 2))
  }

  async getLoop(userId: string, loopId: string): Promise<OpenLoop | undefined> {
    const loop = this.loops.get(loopId)
    return loop?.userId === userId ? loop : undefined
  }

  async putLoop(loop: OpenLoop): Promise<void> {
    this.loops.set(loop.id, loop)
    await this.persist()
  }

  async listLoops(userId: string, filter: LoopFilter = {}): Promise<OpenLoop[]> {
    const statuses = filter.status === undefined ? undefined : new Set([filter.status].flat())
    return [...this.loops.values()]
      .filter((l) => l.userId === userId && (!statuses || statuses.has(l.status)))
      .sort(
        (a, b) =>
          (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
          a.createdAt.localeCompare(b.createdAt),
      )
  }

  async findLoopsBySource(userId: string, sourceId: string): Promise<OpenLoop[]> {
    return [...this.loops.values()].filter(
      (l) => l.userId === userId && l.sourceRefs.some((r) => r.sourceId === sourceId),
    )
  }

  async appendEvidence(evidence: Evidence): Promise<void> {
    this.evidence.set(evidence.loopId, [...(this.evidence.get(evidence.loopId) ?? []), evidence])
    await this.persist()
  }

  async listEvidence(loopId: string): Promise<Evidence[]> {
    return [...(this.evidence.get(loopId) ?? [])].sort((a, b) =>
      a.observedAt.localeCompare(b.observedAt),
    )
  }

  async putAction(action: ProposedAction): Promise<void> {
    this.actions.set(action.id, action)
    await this.persist()
  }

  async getAction(userId: string, actionId: string): Promise<ProposedAction | undefined> {
    const action = this.actions.get(actionId)
    return action?.userId === userId ? action : undefined
  }

  async listActions(
    userId: string,
    filter: { loopId?: string; status?: ProposedActionStatus } = {},
  ): Promise<ProposedAction[]> {
    return [...this.actions.values()]
      .filter(
        (a) =>
          a.userId === userId &&
          (filter.loopId === undefined || a.loopId === filter.loopId) &&
          (filter.status === undefined || a.status === filter.status),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async appendAudit(event: AuditEvent): Promise<void> {
    this.audit.push(event)
    await this.persist()
  }

  async listAudit(
    userId: string,
    opts: { loopId?: string; limit?: number } = {},
  ): Promise<AuditEvent[]> {
    const rows = this.audit
      .filter((e) => e.userId === userId && (opts.loopId === undefined || e.loopId === opts.loopId))
      .sort((a, b) => b.at.localeCompare(a.at))
    return opts.limit === undefined ? rows : rows.slice(0, opts.limit)
  }
}
