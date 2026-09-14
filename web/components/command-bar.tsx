'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

type Answer = {
  answer: string
  references: { loopId: string; title: string; sourceIds: string[] }[]
  suggests: 'handle' | 'scan' | 'catch_up' | 'none'
  confidence: number
}

/** Ask only reads (ADR-0005); when a question asks for work, the answer points at the control that does it. */
const CONTROL: Record<Answer['suggests'], string> = {
  handle: 'Handle what you can, on Today, is what carries this out.',
  scan: 'Scan inbox, on Today, reads the mail first.',
  catch_up: 'Catch me up, on Today, shows what changed.',
  none: '',
}

const EXAMPLES = [
  'What is the most important thing I have not done?',
  'What am I waiting on?',
  'Why do you think tuition is unpaid?',
]

/**
 * The command bar (SPEC §8G): ⌘K opens it anywhere, Escape closes it, and the answer appears in the
 * bar rather than taking the screen. It asks the runtime a question and shows what came back with
 * the loops it leaned on; it never executes anything, so the policy gate stays in code.
 */
export function CommandBar({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [running, setRunning] = useState(false)
  const [answer, setAnswer] = useState<Answer>()
  const [error, setError] = useState<string>()
  const wrap = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (open) close()
        return
      }
      if (event.key !== 'k' && event.key !== 'K') return
      if (!event.metaKey && !event.ctrlKey) return
      const target = event.target as HTMLElement | null
      // Typing somewhere else keeps its own shortcut, unless it is this bar's own field.
      if (
        target?.closest('input, textarea, select, [contenteditable]') &&
        !wrap.current?.contains(target)
      )
        return
      if (!configured) return
      event.preventDefault()
      setOpen((was) => !was)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close, configured])

  useEffect(() => {
    if (!open) return
    field.current?.focus()
    function onPointer(event: PointerEvent) {
      if (!wrap.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open, close])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const asked = question.trim()
    if (!asked || running) return
    setRunning(true)
    setError(undefined)
    setAnswer(undefined)
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: asked }),
      })
      const body = (await res.json()) as Answer & { error?: string }
      if (!res.ok) throw new Error(body.error ?? 'The agent could not answer that.')
      setAnswer(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="ask-wrap" ref={wrap}>
      <button
        type="button"
        className="ask-trigger"
        aria-expanded={open}
        disabled={!configured}
        title={configured ? 'Ask about your loops' : 'Available when the workspace is connected'}
        onClick={() => setOpen((was) => !was)}
      >
        Ask
        <kbd>⌘K</kbd>
      </button>
      {open && (
        <div className="ask-panel" role="dialog" aria-label="Ask your agent">
          <form className="ask-form" onSubmit={submit}>
            <input
              ref={field}
              type="text"
              className="ask-input"
              placeholder="Ask about your loops"
              maxLength={500}
              value={question}
              disabled={running}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button type="submit" disabled={running || question.trim().length === 0}>
              {running ? 'Asking…' : 'Ask'}
            </button>
          </form>
          {running && <p className="ask-note">Reading your ledger…</p>}
          {error && <p className="agent-error">{error}</p>}
          {answer && (
            <div className="ask-answer" role="status">
              <p className="ask-text">{answer.answer}</p>
              {CONTROL[answer.suggests] && (
                <p className="ask-note">{CONTROL[answer.suggests]} Nothing has run.</p>
              )}
              {answer.references.length > 0 && (
                <ul className="ask-refs">
                  {answer.references.map((ref) => (
                    <li key={ref.loopId}>
                      <Link href={`/loops/${ref.loopId}`} className="ask-ref" onClick={close}>
                        {ref.title}
                      </Link>
                      {ref.sourceIds.map((id) => (
                        <Link
                          key={id}
                          href={`/messages/${id}`}
                          className="ask-source"
                          onClick={close}
                        >
                          {id}
                        </Link>
                      ))}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {!answer && !running && !error && (
            <ul className="ask-examples">
              {EXAMPLES.map((example) => (
                <li key={example}>
                  <button type="button" onClick={() => setQuestion(example)}>
                    {example}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
