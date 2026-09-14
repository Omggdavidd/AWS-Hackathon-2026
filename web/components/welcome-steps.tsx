'use client'

import { useEffect, useRef, useState } from 'react'
import { nameAgent } from '@/app/actions'
import { SubmitButton } from '@/components/submit-button'
import { NAME_MAX } from '@/lib/agent-name'
import { DEMO_INBOX, DEMO_NAME, EMAIL_MAX, PURPOSES } from '@/lib/profile'

const STEPS = [
  { id: 'you', title: 'What should we call you?', hint: 'It greets you by this name.' },
  {
    id: 'agent',
    title: 'Name your agent',
    hint: 'It signs the drafts it prepares with this name.',
  },
  {
    id: 'purpose',
    title: 'What are you using Open Loops for?',
    hint: 'Shapes what it looks for and how it talks about it.',
  },
  {
    id: 'inbox',
    title: 'Which inbox should it read?',
    hint: 'Prefilled with the demo inbox. It shows in the top bar as the one connected.',
  },
] as const

type Phase = { name: 'idle' } | { name: 'leaving'; to: number }

/**
 * The four welcome questions, one at a time (#176). All four fields live in one form so a single
 * submit sets every cookie as before; steps not on screen are `hidden`, which keeps their values.
 * A step slides out and the next slides in; with reduced motion the switch is immediate.
 */
export function WelcomeSteps() {
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>({ name: 'idle' })
  const [dir, setDir] = useState<1 | -1>(1)
  const panels = useRef<(HTMLDivElement | null)[]>([])

  const last = index === STEPS.length - 1

  useEffect(() => {
    if (phase.name !== 'idle') return
    const panel = panels.current[index]
    const field = panel?.querySelector<HTMLElement>('input:not([type=radio]), input:checked')
    field?.focus({ preventScroll: true })
  }, [index, phase])

  function go(to: number) {
    if (to < 0 || to >= STEPS.length || phase.name !== 'idle') return
    if (to > index) {
      const panel = panels.current[index]
      const inputs = panel?.querySelectorAll<HTMLInputElement>('input') ?? []
      for (const input of inputs) if (!input.reportValidity()) return
    }
    setDir(to > index ? 1 : -1)
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setIndex(to)
    else setPhase({ name: 'leaving', to })
  }

  function landed() {
    if (phase.name !== 'leaving') return
    setIndex(phase.to)
    setPhase({ name: 'idle' })
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== 'Enter' || last) return
    const target = event.target as HTMLElement
    if (target.tagName !== 'INPUT') return
    event.preventDefault()
    go(index + 1)
  }

  return (
    <form action={nameAgent} className="welcome-form welcome-steps" onKeyDown={onKeyDown}>
      <ol className="welcome-progress" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            data-done={i < index || undefined}
            aria-current={i === index ? 'step' : undefined}
          >
            <span className="sr-only">{s.title}</span>
          </li>
        ))}
      </ol>

      <div className="welcome-viewport">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            ref={(el) => {
              panels.current[i] = el
            }}
            className="welcome-step"
            hidden={i !== index}
            data-phase={i === index ? phase.name : undefined}
            data-dir={dir}
            onAnimationEnd={i === index ? landed : undefined}
            aria-hidden={i !== index}
          >
            {s.id === 'you' && (
              <div className="welcome-field">
                <label htmlFor="you-name">{s.title}</label>
                <p className="welcome-hint">{s.hint}</p>
                <div className="welcome-row">
                  <input
                    id="you-name"
                    name="you"
                    defaultValue={DEMO_NAME}
                    maxLength={NAME_MAX}
                    autoComplete="given-name"
                    required
                  />
                </div>
              </div>
            )}
            {s.id === 'agent' && (
              <div className="welcome-field">
                <label htmlFor="agent-name">{s.title}</label>
                <p className="welcome-hint">{s.hint}</p>
                <div className="welcome-row">
                  <input
                    id="agent-name"
                    name="name"
                    defaultValue="Loop"
                    maxLength={NAME_MAX}
                    autoComplete="off"
                    required
                  />
                </div>
              </div>
            )}
            {s.id === 'purpose' && (
              <fieldset className="welcome-field">
                <legend>{s.title}</legend>
                <p className="welcome-hint">{s.hint}</p>
                <div className="welcome-choices">
                  {PURPOSES.map((p) => (
                    <label key={p.id} className="welcome-choice">
                      <input
                        type="radio"
                        name="purpose"
                        value={p.id}
                        defaultChecked={p.id === 'school'}
                      />
                      <span className="welcome-choice-label">{p.label}</span>
                      <small className="welcome-choice-hint">{p.hint}</small>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {s.id === 'inbox' && (
              <div className="welcome-field">
                <label htmlFor="inbox">{s.title}</label>
                <p className="welcome-hint">{s.hint}</p>
                <div className="welcome-row">
                  <input
                    id="inbox"
                    name="inbox"
                    type="email"
                    defaultValue={DEMO_INBOX}
                    maxLength={EMAIL_MAX}
                    autoComplete="email"
                    required
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="welcome-nav">
        <button
          type="button"
          className="welcome-back"
          onClick={() => go(index - 1)}
          disabled={index === 0 || phase.name !== 'idle'}
        >
          Back
        </button>
        <span className="welcome-count" aria-hidden="true">
          {index + 1} of {STEPS.length}
        </span>
        {last ? (
          <SubmitButton pendingLabel="Opening…">Start</SubmitButton>
        ) : (
          <button
            type="button"
            className="welcome-next"
            onClick={() => go(index + 1)}
            disabled={phase.name !== 'idle'}
          >
            Next
          </button>
        )}
      </div>
    </form>
  )
}
