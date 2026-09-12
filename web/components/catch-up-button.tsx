'use client'

import Link from 'next/link'
import { useState } from 'react'

type Summary = {
  headline: string
  items: {
    loopId: string
    title: string
    kind: 'resolved' | 'needs_you' | 'deadline' | 'waiting' | 'fyi'
    text: string
  }[]
  nothingElse: boolean
  since: string
}

const KIND_LABEL: Record<Summary['items'][number]['kind'], string> = {
  resolved: 'Resolved',
  needs_you: 'Needs you',
  deadline: 'Due soon',
  waiting: 'Waiting',
  fyi: 'FYI',
}

/** "Catch me up": state changes since the last check, not a summary of emails (SPEC §8D). */
export function CatchUpButton({ configured }: { configured: boolean }) {
  const [running, setRunning] = useState(false)
  const [summary, setSummary] = useState<Summary>()
  const [error, setError] = useState<string>()

  async function run() {
    setRunning(true)
    setError(undefined)
    try {
      const res = await fetch('/api/catch-up', { method: 'POST' })
      const body = (await res.json()) as Summary & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'failed')
      setSummary(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={!configured || running}
        title={
          configured
            ? 'What changed since you last looked'
            : 'Set OPENLOOP_RUNTIME_ARN and OPENLOOP_LEDGER_TABLE to enable'
        }
        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
      >
        {running ? 'Catching up…' : 'Catch me up'}
      </button>
      {summary && (
        <div className="max-w-md rounded-lg border border-border bg-card p-3 text-sm">
          <p className="font-medium">{summary.headline}</p>
          {summary.items.length > 0 && (
            <ul className="mt-2 space-y-1">
              {summary.items.map((i) => (
                <li key={`${i.loopId}-${i.kind}`}>
                  <span className="text-xs uppercase tracking-wider text-muted">
                    {KIND_LABEL[i.kind]}
                  </span>{' '}
                  <Link href={`/loops/${i.loopId}`} className="underline-offset-2 hover:underline">
                    {i.title}
                  </Link>
                  <span className="text-muted">: {i.text}</span>
                </li>
              ))}
            </ul>
          )}
          {summary.nothingElse && <p className="mt-2 text-muted">Nothing else needs you.</p>}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
