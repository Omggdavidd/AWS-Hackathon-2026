'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type ScanEvent =
  | { type: 'thread'; threadId: string; subject: string }
  | { type: 'skipped'; threadId: string; reason: string }
  | { type: 'loop'; loop: { title: string; status: string } }
  | { type: 'updated'; loop: { title: string }; from: string; to: string }
  | {
      type: 'summary'
      summary: { threads: number; created: number; updated: number; skipped: number }
    }

/**
 * Runs a scan on the deployed agent and shows progress; the dashboard refreshes as loops land.
 * `variant: 'delta'` replays the next-morning batch so the demo can show loops closing from new mail.
 */
export function ScanButton({
  configured,
  variant = 'base',
  label = 'Scan inbox',
  subtle = false,
}: {
  configured: boolean
  variant?: 'base' | 'delta'
  label?: string
  subtle?: boolean
}) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [lines, setLines] = useState<{ id: number; text: string }[]>([])
  const [nextId, setNextId] = useState(0)
  const [progress, setProgress] = useState<{ threads: number; found: number; done?: string }>()
  const [error, setError] = useState<string>()

  async function run() {
    setRunning(true)
    setLines([])
    setError(undefined)
    setProgress({ threads: 0, found: 0 })
    try {
      const res = await fetch(`/api/scan?variant=${variant}`, { method: 'POST' })
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
        for (const line of parts) {
          if (line.startsWith('event: error')) setError('The agent reported an error.')
          if (!line.startsWith('data: ')) continue
          const event = parseEvent(line.slice(6))
          if (!event) continue
          if (event.type === 'thread')
            setProgress((p) => ({ ...(p ?? { found: 0 }), threads: (p?.threads ?? 0) + 1 }))
          if (event.type === 'loop' || event.type === 'updated')
            setProgress((p) => ({ ...(p ?? { threads: 0 }), found: (p?.found ?? 0) + 1 }))
          if (event.type === 'summary') {
            const n = event.summary.created + event.summary.updated
            setProgress((p) => ({
              ...(p ?? { threads: 0, found: 0 }),
              done: `${n} thing${n === 1 ? '' : 's'} worth checking in ${event.summary.threads} threads.`,
            }))
          }
          const text = describe(event)
          if (text) {
            setNextId((id) => id + 1)
            setLines((prev) => [...prev.slice(-11), { id: nextId + prev.length, text }])
          }
          if (
            (event.type === 'loop' || event.type === 'updated') &&
            Date.now() - lastRefresh > 5000
          ) {
            lastRefresh = Date.now()
            router.refresh()
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed')
    } finally {
      setRunning(false)
      router.refresh()
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        data-primary={!subtle}
        disabled={!configured || running}
        title={
          configured ? 'Scan the connected inbox' : 'Available when the workspace is connected'
        }
        className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${subtle ? 'border border-border bg-card hover:bg-background' : 'bg-foreground text-background hover:opacity-90'}`}
      >
        {running ? 'Scanning…' : label}
      </button>
      {progress && (running || progress.done) && (
        <div role="status" className="max-w-md rounded-lg border border-border bg-card p-3 text-sm">
          <p className="font-medium">
            {progress.done ??
              `Checking your inbox… ${progress.threads} thread${progress.threads === 1 ? '' : 's'} read, ${progress.found} worth tracking`}
          </p>
          {running && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-border">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-foreground/60" />
            </div>
          )}
        </div>
      )}
      {(lines.length > 0 || error) && (
        <ol className="space-y-0.5 font-mono text-xs text-muted">
          {lines.map((l) => (
            <li key={l.id}>{l.text}</li>
          ))}
          {error && <li className="text-red-600">{error}</li>}
        </ol>
      )}
    </div>
  )
}

function parseEvent(raw: string): ScanEvent | undefined {
  try {
    const first = JSON.parse(raw)
    return typeof first === 'string' ? (JSON.parse(first) as ScanEvent) : (first as ScanEvent)
  } catch {
    return undefined
  }
}

function describe(e: ScanEvent): string | undefined {
  switch (e.type) {
    case 'thread':
      return `Reading: ${e.subject}`
    case 'skipped':
      return `  no action needed`
    case 'loop':
      return `  ${e.loop.status.replace('_', ' ').toLowerCase()}: ${e.loop.title}`
    case 'updated':
      return `  ${e.loop.title}: ${e.from.replace('_', ' ').toLowerCase()} → ${e.to.replace('_', ' ').toLowerCase()}`
    case 'summary':
      return `Done. ${e.summary.created} new, ${e.summary.updated} updated, from ${e.summary.threads} threads.`
    default:
      return undefined
  }
}
