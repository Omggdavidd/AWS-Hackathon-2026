'use client'

import type { LoopStatus } from '@openloop/shared'
import Link from 'next/link'
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { markDone, remindTomorrow } from '@/app/actions'
import { announceUndo, type Move } from '@/lib/undo-store'

/** How far a row travels before letting go commits the move, in CSS pixels. */
const THRESHOLD = 96
/** The farthest a row is allowed to travel. */
const LIMIT = 150
/** Let go between this and the threshold and the row stays open on its button instead of springing back. */
const STICK = 36
/** Where a row that stays open rests: the whole button in view, still short of committing. */
const PEEK = 88
/** A trackpad never says the fingers lifted, so this long without a wheel event counts as letting go. */
const IDLE_MS = 180
/** After a move, wheel input is ignored until the trackpad has been quiet this long, so momentum cannot move the row again. */
const QUIET_MS = 300
/** Long enough for a moved row to fold away (`.tl-row[data-busy]`) before it returns in its new state. */
const FOLD_MS = 420
/** How long a returning row plays `row-land`; the marker comes off after, so the next move can play it again. */
const LAND_MS = 520
const WORD: Record<Move, string> = { done: 'Done', snooze: 'Snooze' }

/** Loop ids this tab has already shown; a row animates in only the first time, so a scan's new loops land and the rest stay put. */
const seen = new Set<string>()

const clamp = (x: number) => Math.max(-LIMIT, Math.min(LIMIT, x))

/**
 * A list row that can be swiped: right for Done, left for Snooze, on a touch screen or a
 * trackpad. The row follows the gesture and holds wherever it is held. Let go past the threshold
 * and the move commits; let go part of the way and the row stays open on a Done or Snooze button,
 * the way Mail does, until it is tapped, swiped back, or anything else is touched. A move that
 * lands folds the row away and brings it back in its new state rather than sliding it back where
 * it was, with an Undo that stays for eight seconds (the toast itself lives in `UndoToast`, since a
 * row can leave the list once the move lands). On a desktop the same two moves slide in on hover.
 * Approve is never a swipe; it always goes through the decision sheet.
 */
export function SwipeRow({
  loopId,
  status,
  closed,
  openHref,
  sourceHref,
  className,
  index = 0,
  children,
  ...rest
}: {
  loopId: string
  status: LoopStatus
  closed: boolean
  openHref: string
  sourceHref?: string | undefined
  className: string
  /** Position in the list, for the stagger when several rows land together. */
  index?: number
  children: React.ReactNode
} & Record<`data-${string}`, string | undefined> & { 'aria-current'?: 'true' | undefined }) {
  const row = useRef<HTMLLIElement>(null)
  const drag = useRef<{ x: number; y: number; id: number; base: number; moved: boolean } | null>(
    null,
  )
  const wheel = useRef({
    x: 0,
    active: false,
    lockedUntil: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  })
  /** The offset as the handlers need it between renders. */
  const offset = useRef(0)
  /** A drag ends in a click on whatever was under the finger; that click is not a request to open the loop. */
  const swallowClick = useRef(false)
  const [dx, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState<Move>()
  const [landed, setLanded] = useState(false)
  const [fresh] = useState(() => !seen.has(loopId))
  useEffect(() => {
    seen.add(loopId)
  }, [loopId])
  useEffect(() => () => clearTimeout(wheel.current.timer), [])
  useEffect(() => {
    if (!landed) return
    const timer = setTimeout(() => setLanded(false), LAND_MS)
    return () => clearTimeout(timer)
  }, [landed])

  function moveTo(x: number) {
    offset.current = x
    setOffset(x)
  }

  const open: Move | undefined =
    !busy && !dragging && Math.abs(dx) >= STICK ? (dx > 0 ? 'done' : 'snooze') : undefined

  // An open row closes when anything else is touched or Escape is pressed.
  useEffect(() => {
    if (!open) return
    const shut = () => {
      offset.current = 0
      setOffset(0)
    }
    const onDown = (event: PointerEvent) => {
      if (!row.current?.contains(event.target as Node)) shut()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') shut()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function commit(move: Move) {
    if (busy || closed) return
    clearTimeout(wheel.current.timer)
    wheel.current.active = false
    wheel.current.lockedUntil = Date.now() + QUIET_MS
    setDragging(false)
    setBusy(move)
    const since = new Date().toISOString()
    try {
      await Promise.all([
        move === 'done' ? markDone(loopId) : remindTomorrow(loopId),
        new Promise((resolve) => setTimeout(resolve, FOLD_MS)),
      ])
      announceUndo({ loopId, previous: status, move, since })
      setLanded(true)
    } finally {
      moveTo(0)
      setBusy(undefined)
    }
  }

  /** Where a gesture ends: commit past the threshold, stay open part of the way, spring back otherwise. */
  function settle(x: number) {
    setDragging(false)
    if (Math.abs(x) >= THRESHOLD) void commit(x > 0 ? 'done' : 'snooze')
    else if (Math.abs(x) >= STICK) moveTo(Math.sign(x) * Math.max(Math.abs(x), PEEK))
    else moveTo(0)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLLIElement>) {
    swallowClick.current = false
    if (closed || busy || event.pointerType === 'mouse') return
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      base: offset.current,
      moved: false,
    }
  }
  function onPointerMove(event: ReactPointerEvent<HTMLLIElement>) {
    const d = drag.current
    if (!d || event.pointerId !== d.id) return
    const mx = event.clientX - d.x
    if (!d.moved) {
      if (Math.abs(mx) < 8) {
        // Mostly vertical: the page is scrolling, not the row.
        if (Math.abs(event.clientY - d.y) > 12) drag.current = null
        return
      }
      d.moved = true
      row.current?.setPointerCapture(d.id)
      setDragging(true)
    }
    moveTo(clamp(d.base + mx))
  }
  /** Also the cancel handler: a browser that takes a held touch away (a long press) leaves the row where it was held. */
  function onPointerUp(event: ReactPointerEvent<HTMLLIElement>) {
    const d = drag.current
    if (!d || event.pointerId !== d.id) return
    drag.current = null
    if (!d.moved) return
    swallowClick.current = true
    settle(offset.current)
  }
  function onWheel(event: React.WheelEvent<HTMLLIElement>) {
    if (closed || busy) return
    const w = wheel.current
    const now = Date.now()
    if (now < w.lockedUntil) {
      w.lockedUntil = now + QUIET_MS
      return
    }
    if (Math.abs(event.deltaX) < Math.abs(event.deltaY)) return
    if (!w.active) {
      w.active = true
      w.x = offset.current
      setDragging(true)
    }
    w.x = clamp(w.x - event.deltaX)
    moveTo(w.x)
    clearTimeout(w.timer)
    w.timer = setTimeout(() => {
      w.active = false
      settle(w.x)
    }, IDLE_MS)
  }
  function onClickCapture(event: ReactMouseEvent<HTMLLIElement>) {
    const onButton = (event.target as HTMLElement).closest('.swipe-under')
    if (swallowClick.current || (open && !onButton)) {
      event.preventDefault()
      event.stopPropagation()
      swallowClick.current = false
      if (open) moveTo(0)
    }
  }

  const reveal = dx > 0 ? 'done' : dx < 0 ? 'snooze' : undefined
  const armed = Math.abs(dx) >= THRESHOLD

  return (
    <li
      ref={row}
      className={className}
      data-reveal={reveal}
      data-armed={armed || undefined}
      data-open={open}
      data-dragging={dragging || undefined}
      data-busy={busy || undefined}
      data-fresh={fresh || undefined}
      data-landed={landed || undefined}
      style={fresh ? ({ '--i': Math.min(index, 12) } as React.CSSProperties) : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onClickCapture={onClickCapture}
      {...rest}
    >
      {/* Pointer-only: the same two moves are real, focusable buttons in the row's own actions. */}
      <span className="swipe-under" aria-hidden="true">
        {(['done', 'snooze'] as const).map((move) => (
          <button
            key={move}
            type="button"
            tabIndex={-1}
            className="swipe-word"
            data-move={move}
            onClick={() => commit(move)}
          >
            {WORD[move]}
          </button>
        ))}
      </span>
      <div
        className="swipe-face"
        style={
          busy
            ? { transform: `translateX(${busy === 'done' ? '110%' : '-110%'})` }
            : dx
              ? { transform: `translateX(${dx}px)` }
              : undefined
        }
      >
        {children}
        <div className="tl-actions">
          <Link href={openHref} className="tl-action">
            Open
          </Link>
          {sourceHref && (
            <Link href={sourceHref} className="tl-action">
              Source
            </Link>
          )}
          {!closed && (
            <>
              <button
                type="button"
                className="tl-action"
                data-move="snooze"
                disabled={Boolean(busy)}
                onClick={() => commit('snooze')}
              >
                Snooze
              </button>
              <button
                type="button"
                className="tl-action"
                data-move="done"
                disabled={Boolean(busy)}
                onClick={() => commit('done')}
              >
                {busy === 'done' ? 'Saving…' : 'Done'}
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}
