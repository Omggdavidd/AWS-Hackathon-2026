import type { LoopStatus, OpenLoop } from '@openloop/shared'

/** Cell value for a thread the run (or the expected ledger) produced no loop for. */
export const MISSING = 'none'

export type AgreementCell = LoopStatus | typeof MISSING

/** Just enough of a loop to place a status on a thread; keeps the comparison independent of the store. */
export type LoopStatusRef = Pick<OpenLoop, 'status' | 'sourceRefs'>

export interface AgreementRow {
  threadId: string
  expected: AgreementCell
  /** One cell per run, in run order. */
  runs: AgreementCell[]
  /** True when every run produced the expected status. */
  agrees: boolean
}

export interface AgreementReport {
  rows: AgreementRow[]
  runs: number
  /** Threads where every run matched the expected ledger. */
  agreed: number
  total: number
}

/**
 * Pure comparison behind the agreement script: expected loops from demo/seed-ledger.json against the
 * loops each real run produced. Rows follow the expected ledger, then any extra thread a run invented.
 * A thread with several loops in one run is read from the first one.
 */
export function compareRuns(expected: LoopStatusRef[], runs: LoopStatusRef[][]): AgreementReport {
  const expectedByThread = byThread(expected)
  const runsByThread = runs.map(byThread)
  const threadIds = [...expectedByThread.keys()]
  for (const run of runsByThread)
    for (const threadId of run.keys()) if (!threadIds.includes(threadId)) threadIds.push(threadId)

  const rows: AgreementRow[] = threadIds.map((threadId) => {
    const expectedStatus: AgreementCell = expectedByThread.get(threadId) ?? MISSING
    const cells = runsByThread.map((run) => run.get(threadId) ?? MISSING)
    return {
      threadId,
      expected: expectedStatus,
      runs: cells,
      agrees: cells.length > 0 && cells.every((c) => c === expectedStatus),
    }
  })
  return {
    rows,
    runs: runs.length,
    agreed: rows.filter((r) => r.agrees).length,
    total: rows.length,
  }
}

/** First status per thread. Loops built only from calendar sources fall back to their source id. */
function byThread(loops: LoopStatusRef[]): Map<string, LoopStatus> {
  const map = new Map<string, LoopStatus>()
  for (const loop of loops) {
    const ref = loop.sourceRefs.find((r) => r.threadId) ?? loop.sourceRefs[0]
    if (!ref) continue
    const threadId = ref.threadId ?? ref.sourceId
    if (!map.has(threadId)) map.set(threadId, loop.status)
  }
  return map
}
