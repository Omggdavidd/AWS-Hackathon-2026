'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TOUR_COOKIE } from '@/lib/agent-name'

type Step = { target: string; title: string; text: string }

const STEPS: Step[] = [
  {
    target: 'headline',
    title: 'What needs you, first',
    text: 'Your loops as one bar: a segment per state, widest where there are most. What needs you comes first. Click a segment to jump to its part of the list.',
  },
  {
    target: 'agent',
    title: 'Your agent',
    text: 'Scan the inbox, check for new mail, let it handle what is safe, or ask what changed since you last looked. It never sends or pays without you.',
  },
  {
    target: 'row',
    title: 'One row, one responsibility',
    text: 'Who it is from, what kind, when it is due and its state. Click a row to read the evidence beside the list; arrow keys move between rows.',
  },
  {
    target: 'views',
    title: 'Three ways to see the same loops',
    text: 'Today by time, Board as groups you can arrange, Calendar on the month. Decisions holds everything waiting on a yes or no from you.',
  },
  {
    target: 'bell',
    title: 'What changed',
    text: 'Every change lands here quietly. A device notification fires only for a loop that needs a decision now.',
  },
]

const GAP = 14
const CARD_WIDTH = 340

type Box = { top: number; left: number; width: number; height: number }

function findTarget(name: string): HTMLElement | undefined {
  const all = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)]
  // The rail and the bottom tabs both carry the views; take whichever is on screen.
  return all.find((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
}

function remember() {
  // biome-ignore lint/suspicious/noDocumentCookie: matches the theme preference, read by the server.
  document.cookie = `${TOUR_COOKIE}=1; Path=/; Max-Age=31536000; SameSite=Lax`
}

/**
 * Five stops over the real page, each anchored to something the person can see and use. Skippable
 * at every step, remembered in a cookie, replayable from About. Steps whose anchor is not on this
 * page (an empty list has no row) are passed over rather than shown pointing at nothing.
 */
export function Tour() {
  const router = useRouter()
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box>()
  const [done, setDone] = useState(false)
  const card = useRef<HTMLDivElement>(null)

  const steps = STEPS
  const step = steps[index]

  // biome-ignore lint/correctness/useExhaustiveDependencies: finish and steps are stable for the life of the tour.
  useLayoutEffect(() => {
    if (done || !step) return
    const el = findTarget(step.target)
    if (!el) {
      if (index < steps.length - 1) setIndex(index + 1)
      else finish()
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    const measure = () => {
      const r = el.getBoundingClientRect()
      setBox({ top: r.top - 6, left: r.left - 6, width: r.width + 12, height: r.height + 12 })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [index, done, step?.target])

  useEffect(() => {
    card.current?.querySelector<HTMLButtonElement>('button[data-next]')?.focus()
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
      if (event.key === 'ArrowRight' || event.key === 'Enter') next()
      if (event.key === 'ArrowLeft') back()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  function finish() {
    remember()
    setDone(true)
    router.replace('/', { scroll: false })
  }
  function next() {
    if (index < steps.length - 1) setIndex(index + 1)
    else finish()
  }
  function back() {
    if (index > 0) setIndex(index - 1)
  }

  if (done || !box || !step) return null
  const below = box.top + box.height + GAP + 180 < window.innerHeight
  const cardTop = below ? box.top + box.height + GAP : Math.max(12, box.top - GAP - 180)
  const cardLeft = Math.max(12, Math.min(box.left, window.innerWidth - CARD_WIDTH - 12))

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <div
        className="tour-ring"
        style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        aria-hidden="true"
      />
      <div className="tour-card" ref={card} style={{ top: cardTop, left: cardLeft }}>
        <p className="tour-step">
          {index + 1} of {steps.length}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="tour-buttons">
          <button type="button" className="tour-skip" onClick={finish}>
            Skip the tour
          </button>
          <span className="tour-nav">
            {index > 0 && (
              <button type="button" className="tour-back" onClick={back}>
                Back
              </button>
            )}
            <button type="button" className="tour-next" data-next onClick={next}>
              {index === steps.length - 1 ? 'Done' : 'Next'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
