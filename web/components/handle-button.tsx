'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Handled = {
  handled: { status: string; summary: string }[]
  needsYou: { summary: string; reason: string }[]
}

/** "Handle what you can": one click runs every allowed action; the rest is listed for the user (SPEC §8E). */
export function HandleButton({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<Handled>()
  const [error, setError] = useState<string>()

  async function run() {
    setRunning(true)
    setError(undefined)
    try {
      const res = await fetch('/api/handle', { method: 'POST' })
      const body = (await res.json()) as Handled & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'failed')
      setResult(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
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
        disabled={!configured || running}
        title={
          configured
            ? 'Let the agent do everything that is safe'
            : 'Available when the workspace is connected'
        }
        className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
      >
        {running ? 'Handling…' : 'Handle what you can'}
      </button>
      {result && (
        <div className="space-y-1 text-xs text-muted">
          {result.handled.length > 0 && <p>I handled {result.handled.length}:</p>}
          {result.handled.map((h) => (
            <p key={h.summary}>✓ {h.summary}</p>
          ))}
          {result.needsYou.length > 0 && <p>I need you for:</p>}
          {result.needsYou.map((n) => (
            <p key={n.summary}>→ {n.summary}</p>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
