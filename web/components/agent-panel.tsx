'use client'

import type { ScanSummary } from '@openloop/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { StateIcon } from '@/components/loop-mark'
import { DEMO_TIME_ZONE } from '@/lib/format'
import { formatScanCounts, formatScanStatus } from '@/lib/scan-summary'

type Op = 'catch_up' | 'handle' | 'delta' | 'scan'

type CatchUp = {
  headline: string
  items: {
    loopId: string
    title: string
    kind: 'resolved' | 'needs_you' | 'deadline' | 'waiting' | 'fyi'
    text: string
  }[]
  nothingElse: boolean
}

type Handled = {
  handled: { status: string; summary: string }[]
  needsYou: { summary: string; reason: string }[]
}

type ScanEvent =
  | { type: 'thread'; threadId: string; subject: string }
  | { type: 'skipped'; threadId: string; reason: string }
  | { type: 'loop'; loop: { title: string; status: string } }
  | { type: 'updated'; loop: { title: string }; from: string; to: string }
  | { type: 'summary'; summary: ScanSummary }

type ScanState = {
  threads: number
  found: number
  lines: { id: number; kind: 'read' | 'loop' | 'skip' | 'done'; text: string }[]
  done?: string
}

type Result =
  | { op: 'catch_up'; at: Date; summary?: CatchUp }
  | { op: 'handle'; at: Date; handled: Handled }
  | { op: 'scan' | 'delta'; at: Date; scan: ScanState }

const LABEL: Record<Op, { idle: string; busy: string; title: string; hint: string }> = {
  catch_up: {
    idle: 'Catch me up',
    busy: 'Catching up…',
    title: 'What changed',
    hint: 'A short digest of what changed since you last looked. About a minute.',
  },
  handle: {
    idle: 'Handle what you can',
    busy: 'Handling…',
    title: 'Handled',
    hint: 'Do everything that is safe without asking. The rest waits for you.',
  },
  delta: {
    idle: 'Check for new mail',
    busy: 'Checking…',
    title: 'New mail',
    hint: 'Read only what arrived since the last scan.',
  },
  scan: {
    idle: 'Scan inbox',
    busy: 'Scanning…',
    title: 'Scan',
    hint: 'Read the whole inbox from the start. A minute and a half to two minutes.',
  },
}

const ICON: Record<Op, string> = {
  catch_up: 'digest',
  handle: 'resolved',
  delta: 'mail',
  scan: 'refresh',
}

const KIND: Record<CatchUp['items'][number]['kind'], { label: string; state: string }> = {
  needs_you: { label: 'Needs you', state: 'needs-you' },
  deadline: { label: 'Due soon', state: 'waiting' },
  waiting: { label: 'Waiting', state: 'waiting' },
  resolved: { label: 'Resolved', state: 'resolved' },
  fyi: { label: 'FYI', state: 'watching' },
}

/**
 * The agent's four operations and one place for their results (SPEC §8D, §8E). Whatever ran
 * last is shown below the controls, formatted as what it is: a digest, a list of things done,
 * or a scan in progress. The dashboard refreshes as loops land.
 */
export function AgentPanel({
  configured,
  checked,
  name = 'Your agent',
}: {
  configured: boolean
  checked?: string | undefined
  name?: string | undefined
}) {
  const router = useRouter()
  const [running, setRunning] = useState<Op>()
  const [result, setResult] = useState<Result>()
  const [error, setError] = useState<string>()

  async function run(op: Op) {
    setRunning(op)
    setError(undefined)
    setResult(undefined)
    try {
      if (op === 'catch_up') {
        setResult({ op, at: new Date() })
        const res = await fetch('/api/catch-up', { method: 'POST' })
        const body = (await res.json()) as CatchUp & { error?: string }
        if (!res.ok) throw new Error(body.error ?? 'The agent could not catch you up.')
        setResult({ op, at: new Date(), summary: body })
      } else if (op === 'handle') {
        const res = await fetch('/api/handle', { method: 'POST' })
        const body = (await res.json()) as Handled & { error?: string }
        if (!res.ok) throw new Error(body.error ?? 'The agent could not run its actions.')
        setResult({ op, at: new Date(), handled: body })
        router.refresh()
      } else {
        await scan(op)
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      // A catch-up that failed has nothing to show; a scan keeps the lines it already streamed.
      setResult((r) => (r?.op === 'catch_up' && !r.summary ? undefined : r))
    } finally {
      setRunning(undefined)
    }
  }

  async function scan(op: 'scan' | 'delta') {
    const state: ScanState = { threads: 0, found: 0, lines: [] }
    let nextId = 0
    const publish = () =>
      setResult({ op, at: new Date(), scan: { ...state, lines: [...state.lines] } })
    publish()
    const res = await fetch(`/api/scan?variant=${op === 'delta' ? 'delta' : 'base'}`, {
      method: 'POST',
    })
    if (!res.ok || !res.body) throw new Error(await res.text())
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    let lastRefresh = Date.now()
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      const parts = buffer.split('\n')
      buffer = parts.pop() ?? ''
      for (const raw of parts) {
        if (raw.startsWith('event: error')) setError('The agent reported an error.')
        if (!raw.startsWith('data: ')) continue
        const event = parseEvent(raw.slice(6))
        if (!event) continue
        if (event.type === 'thread') state.threads++
        if (event.type === 'loop' || event.type === 'updated') state.found++
        if (event.type === 'summary') state.done = formatScanStatus(event.summary)
        const line = describe(event)
        if (line) state.lines = [...state.lines.slice(-9), { id: nextId++, ...line }]
        publish()
        if (
          (event.type === 'loop' || event.type === 'updated') &&
          Date.now() - lastRefresh > 5000
        ) {
          lastRefresh = Date.now()
          router.refresh()
        }
      }
    }
  }

  const ops: Op[] = ['catch_up', 'handle', 'delta', 'scan']
  const busy = running !== undefined

  return (
    <section
      className="agent-panel"
      aria-labelledby="agent-heading"
      data-busy={busy || undefined}
      data-tour="agent"
    >
      <div className="agent-head">
        <div className="agent-identity">
          <span className="agent-pulse" aria-hidden="true" />
          <div>
            <h2 id="agent-heading">{name}</h2>
            <p>
              {configured
                ? checked
                  ? `Last checked ${checked}`
                  : 'Has not checked yet'
                : 'Sample loops. Connect the workspace to run it.'}
            </p>
          </div>
        </div>
        <div className="agent-actions">
          {ops.map((op) => (
            <div key={op} className="agent-op">
              <button
                type="button"
                onClick={() => run(op)}
                disabled={!configured || busy}
                aria-busy={running === op || undefined}
                aria-describedby={`agent-op-${op}`}
                data-primary={op === 'scan' || undefined}
                title={configured ? undefined : 'Available when the workspace is connected'}
              >
                <span className="agent-op-icon">
                  <StateIcon name={ICON[op]} />
                </span>
                <span>{running === op ? LABEL[op].busy : LABEL[op].idle}</span>
              </button>
              <p id={`agent-op-${op}`} className="agent-op-hint">
                {LABEL[op].hint}
              </p>
            </div>
          ))}
        </div>
      </div>

      {(result || error) && (
        <div className="agent-result" role="status">
          <div className="agent-result-head">
            <span className="agent-result-title">
              {result ? LABEL[result.op].title : 'Something went wrong'}
            </span>
            {result && <time dateTime={result.at.toISOString()}>{formatTime(result.at)}</time>}
            {!busy && (
              <button
                type="button"
                className="agent-dismiss"
                onClick={() => {
                  setResult(undefined)
                  setError(undefined)
                }}
                aria-label="Dismiss"
              >
                Dismiss
              </button>
            )}
          </div>
          {error && <p className="agent-error">{error}</p>}
          {result?.op === 'catch_up' &&
            (result.summary ? (
              <Digest summary={result.summary} />
            ) : (
              <CatchUpProgress startedAt={result.at} />
            ))}
          {result?.op === 'handle' && <HandledList handled={result.handled} />}
          {(result?.op === 'scan' || result?.op === 'delta') && (
            <ScanProgress scan={result.scan} running={busy} />
          )}
        </div>
      )}
    </section>
  )
}

function Digest({ summary }: { summary: CatchUp }) {
  return (
    <div className="digest">
      <p className="digest-headline">{summary.headline}</p>
      {summary.items.length > 0 && (
        <ul className="digest-list">
          {summary.items.map((item) => (
            <li key={`${item.loopId}-${item.kind}`}>
              <span className="status-chip" data-state={KIND[item.kind].state}>
                {KIND[item.kind].label}
              </span>
              <div>
                <Link href={`/loops/${item.loopId}`} className="digest-title">
                  {item.title}
                </Link>
                <p className="digest-text">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {summary.nothingElse && (
        <p className="digest-footer">
          <span className="digest-check" aria-hidden="true">
            ✓
          </span>{' '}
          Nothing else needs you.
        </p>
      )}
    </div>
  )
}

/**
 * The three stages a catch-up really goes through: the ledger and audit reads, the diff, then the
 * model writing the summary. Nothing reports them over the wire, so the captions run on a timer
 * and stay broad on purpose — each one keeps describing work that is still under way.
 */
const CATCH_UP_PHASES = [
  { after: 0, caption: 'Reading your ledger' },
  { after: 4, caption: 'Working out what changed' },
  { after: 10, caption: 'Writing your digest' },
] as const

/** Shown from the click, not from the answer: a minute of a greyed-out button reads as a hang. */
function CatchUpProgress({ startedAt }: { startedAt: Date }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])
  const phase = CATCH_UP_PHASES.filter((p) => elapsed >= p.after).at(-1) ?? CATCH_UP_PHASES[0]
  return (
    <div className="scan">
      <p className="scan-status">
        {phase.caption}
        {/* Hidden from the status region: a counter ticking every second would be announced every second. */}
        <span className="scan-elapsed" aria-hidden="true">
          {elapsed}s
        </span>
      </p>
      <div className="scan-bar" aria-hidden="true">
        <div />
      </div>
    </div>
  )
}

function HandledList({ handled }: { handled: Handled }) {
  if (handled.handled.length === 0 && handled.needsYou.length === 0)
    return <p className="digest-footer">Nothing to handle right now.</p>
  return (
    <div className="handled">
      {handled.handled.length > 0 && (
        <div>
          <h3>
            Done <span className="handled-count">{handled.handled.length}</span>
          </h3>
          <ul>
            {handled.handled.map((h) => (
              <li key={h.summary} data-tone="done">
                <span aria-hidden="true">✓</span>
                {h.summary}
              </li>
            ))}
          </ul>
        </div>
      )}
      {handled.needsYou.length > 0 && (
        <div>
          <h3>
            Needs you <span className="handled-count">{handled.needsYou.length}</span>
          </h3>
          <ul>
            {handled.needsYou.map((n) => (
              <li key={n.summary} data-tone="you">
                <span aria-hidden="true">•</span>
                <span>
                  {n.summary}
                  {n.reason && <em> {n.reason}</em>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function ScanProgress({ scan, running }: { scan: ScanState; running: boolean }) {
  return (
    <div className="scan">
      <p className="scan-status">
        {scan.done ??
          `Reading your inbox: ${scan.threads} thread${scan.threads === 1 ? '' : 's'} so far, ${scan.found} worth tracking.`}
      </p>
      {running && (
        <div className="scan-bar" aria-hidden="true">
          <div />
        </div>
      )}
      {scan.lines.length > 0 && (
        <ol className="scan-log">
          {scan.lines.map((line) => (
            <li key={line.id} data-kind={line.kind}>
              {line.text}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function formatTime(at: Date): string {
  return at.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: DEMO_TIME_ZONE,
  })
}

/** `/api/scan` has already put the summary through its schema, so the lines arrive as plain data. */
function parseEvent(raw: string): ScanEvent | undefined {
  try {
    const first = JSON.parse(raw)
    return typeof first === 'string' ? (JSON.parse(first) as ScanEvent) : (first as ScanEvent)
  } catch {
    return undefined
  }
}

const STATE_WORD: Record<string, string> = {
  NEEDS_YOU: 'needs you',
  WAITING: 'waiting',
  WATCHING: 'watching',
  RESOLVED: 'resolved',
  UNCERTAIN: 'uncertain',
}

function describe(
  e: ScanEvent,
): { kind: ScanState['lines'][number]['kind']; text: string } | undefined {
  switch (e.type) {
    case 'thread':
      return { kind: 'read', text: e.subject }
    case 'skipped':
      return { kind: 'skip', text: 'Nothing to track' }
    case 'loop':
      return {
        kind: 'loop',
        text: `${e.loop.title} · ${STATE_WORD[e.loop.status] ?? e.loop.status}`,
      }
    case 'updated':
      return {
        kind: 'loop',
        text: `${e.loop.title} · ${STATE_WORD[e.from] ?? e.from} to ${STATE_WORD[e.to] ?? e.to}`,
      }
    case 'summary':
      return { kind: 'done', text: formatScanCounts(e.summary) }
    default:
      return undefined
  }
}
