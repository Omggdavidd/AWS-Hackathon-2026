import type { GoogleSourceEvent } from '@openloop/shared'

/**
 * Structured pipeline logging (#30). One JSON object per line on stdout, which is what the
 * AgentCore Runtime ships to CloudWatch: per-thread progress and per-role durations, so a scan
 * reads as a pipeline in the log group. Per-step traces are not automatic for TypeScript runtimes
 * (ADR-0008), so these lines are the observability evidence we can actually show.
 */
export interface LogLine {
  /** Step name, e.g. `scan_started`, `thread_started`, `role`, `loop_created`. */
  evt: string
  threadId?: string
  /** Specialist role for `role` lines: extract, investigate, judge, update or plan. */
  role?: string
  /** Wall-clock duration of the step in milliseconds. */
  ms?: number
  [key: string]: unknown
}

export type Logger = (line: LogLine) => void

/** The default everywhere: logging is opt-in so the orchestrator stays silent under test. */
export const noopLogger: Logger = () => {}

/** JSON lines on stdout. `write` is injectable so tests can capture without touching stdout. */
export function jsonLogger(write: (chunk: string) => void = (c) => void process.stdout.write(c)) {
  const log: Logger = (line) =>
    write(`${JSON.stringify({ ts: new Date().toISOString(), ...line })}\n`)
  return log
}

/** Milliseconds since `start`, for steps that are not a single awaited call. */
export function elapsed(start: number): number {
  return Date.now() - start
}

/**
 * What a live Gmail listing lost, as pipeline log lines (#30). Ids, reasons and counts only:
 * subjects, bodies and addresses never reach the log.
 */
export function googleSourceLogger(log: Logger): (event: GoogleSourceEvent) => void {
  return (event) => {
    if (event.type === 'message_skipped') {
      log({ evt: 'source_message_skipped', messageId: event.id, reason: event.reason })
      return
    }
    log({
      evt: 'source_truncated',
      kind: event.kind,
      limit: event.limit,
      from: event.covered.from,
      to: event.covered.to,
    })
  }
}

/** Run `fn`, then log `line` with the elapsed milliseconds. Failures are logged and rethrown. */
export async function timed<T>(log: Logger, line: LogLine, fn: () => Promise<T>): Promise<T> {
  const started = Date.now()
  try {
    const result = await fn()
    log({ ...line, ms: Date.now() - started })
    return result
  } catch (err) {
    log({
      ...line,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}
