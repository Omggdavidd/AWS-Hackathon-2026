import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import * as z from 'zod'
import {
  AuditEvent,
  Evidence,
  OpenLoop,
  ProposedAction,
  type ProposedActionStatus,
} from '../schemas/index'
import {
  compareActionsByCreated,
  compareAuditNewestFirst,
  compareEvidenceByObserved,
  compareLoopsByDue,
  matchesActionFilter,
  matchesAuditFilter,
  matchesLoopFilter,
} from './filters'
import {
  type LedgerStore,
  type LoopFilter,
  type PutLoopOptions,
  StaleLoopWriteError,
} from './store'

/** The on-disk shape, validated on load so a hand-edited file cannot become a parsed type. */
const Snapshot = z.object({
  loops: z.array(OpenLoop).default([]),
  evidence: z.array(Evidence).default([]),
  actions: z.array(ProposedAction).default([]),
  audit: z.array(AuditEvent).default([]),
})
type Snapshot = z.infer<typeof Snapshot>

/**
 * In-process ledger for tests, `agentcore dev` and the seeded demo. Optionally persists to a
 * JSON file after every write so a dev server survives restarts. Not for concurrent processes.
 */
export class LocalLedgerStore implements LedgerStore {
  private loops = new Map<string, OpenLoop>()
  private evidence = new Map<string, Evidence[]>()
  private actions = new Map<string, ProposedAction>()
  private audit: AuditEvent[] = []
  /** Tail of the write queue; see persist(). */
  private writes: Promise<void> = Promise.resolve()

  constructor(private readonly filePath?: string) {}

  static async fromFile(filePath: string): Promise<LocalLedgerStore> {
    const store = new LocalLedgerStore(filePath)
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return store
      throw err
    }
    const snap = parseSnapshot(raw, filePath)
    for (const l of snap.loops) store.loops.set(l.id, l)
    for (const e of snap.evidence)
      store.evidence.set(e.loopId, [...(store.evidence.get(e.loopId) ?? []), e])
    for (const a of snap.actions) store.actions.set(a.id, a)
    store.audit = snap.audit
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

  /**
   * Write the whole ledger, atomically and one at a time.
   *
   * Atomically, because a reader (`fromFile`, or another process) that catches a partial
   * `writeFile` sees truncated JSON and the app will not boot: the temp file absorbs the partial
   * write and `rename` publishes it in one step.
   *
   * One at a time, because two server actions that mutate concurrently would otherwise each take a
   * snapshot and race to `writeFile`; the loser's record disappears from disk. Each queued write
   * takes its own snapshot, so the last file written is never older than the last mutation.
   *
   * The in-memory maps are mutated before the write is queued, so a persist that fails (a full
   * disk, a read-only mount) leaves this process holding records that never reached the file. The
   * error reaches the caller, but the divergence is not repaired: a single-process dev and demo
   * store is the wrong place for a write-ahead log, and DynamoDB is the store for anything that
   * has to survive that.
   */
  private persist(): Promise<void> {
    const file = this.filePath
    if (!file) return Promise.resolve()
    const done = this.writes.then(async () => {
      const payload = JSON.stringify(this.snapshot(), null, 2)
      const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`
      try {
        await writeFile(tmp, payload)
        await rename(tmp, file)
      } catch (err) {
        await rm(tmp, { force: true })
        throw err
      }
    })
    // The queue must outlive a failed write, or one bad write would reject every later one.
    this.writes = done.catch(() => {})
    return done
  }

  async getLoop(userId: string, loopId: string): Promise<OpenLoop | undefined> {
    const loop = this.loops.get(loopId)
    return loop?.userId === userId ? loop : undefined
  }

  /**
   * The compare and the set run in one synchronous step, before the first await, so two callers
   * interleaved by the event loop cannot both find the version they expect. The file write is
   * queued after that, on the same queue as every other write, so the snapshot it takes already
   * includes the swap.
   */
  async putLoop(loop: OpenLoop, opts: PutLoopOptions = {}): Promise<OpenLoop> {
    let next = loop
    if (opts.ifUnchanged) {
      const expected = loop.version ?? 0
      if ((this.loops.get(loop.id)?.version ?? 0) !== expected)
        throw new StaleLoopWriteError(loop.id, expected)
      next = { ...loop, version: expected + 1 }
    }
    this.loops.set(next.id, next)
    await this.persist()
    return next
  }

  async listLoops(userId: string, filter: LoopFilter = {}): Promise<OpenLoop[]> {
    return [...this.loops.values()]
      .filter((l) => l.userId === userId && matchesLoopFilter(l, filter))
      .sort(compareLoopsByDue)
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
    return [...(this.evidence.get(loopId) ?? [])].sort(compareEvidenceByObserved)
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
      .filter((a) => a.userId === userId && matchesActionFilter(a, filter))
      .sort(compareActionsByCreated)
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
      .filter((e) => e.userId === userId && matchesAuditFilter(e, opts))
      .sort(compareAuditNewestFirst)
    return opts.limit === undefined ? rows : rows.slice(0, opts.limit)
  }
}

function parseSnapshot(raw: string, filePath: string): Snapshot {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (err) {
    throw new Error(`Ledger file ${filePath} is not valid JSON: ${(err as Error).message}`)
  }
  const result = Snapshot.safeParse(json)
  if (!result.success)
    throw new Error(
      `Ledger file ${filePath} does not match the ledger schemas:\n${z.prettifyError(result.error)}`,
    )
  return result.data
}
