'use client'

import type { LoopStatus } from '@openloop/shared'
import Link from 'next/link'
import { type PointerEvent as ReactPointerEvent, useRef, useState } from 'react'
import { markDone, remindTomorrow } from '@/app/actions'
import { announceUndo, type Move } from '@/lib/undo-store'

/** How far a row travels before the move commits, in CSS pixels. */
const THRESHOLD = 96
/** The farthest a row is allowed to travel. */
const LIMIT = 150
const WORD: Record<Move, string> = { done: 'Done', snooze: 'Snooze' }

/**
 * A list row that can be swiped: right for Done, left for Snooze, on a touch screen or a
 * trackpad, with a threshold before anything commits and an Undo that stays for eight seconds
 * (the Gmail and Spark pattern; the toast itself lives in `UndoToast`, since this row leaves the
 * list once the move lands). On a desktop the same two moves slide in on hover. Approve is never
 * a swipe; it always goes through the decision sheet.
 */
export function SwipeRow({
  loopId,
  status,
  closed,
  openHref,
  sourceHref,
  className,
  children,
  ...rest
}: {
  loopId: string
  status: LoopStatus
  closed: boolean
  openHref: string
  sourceHref?: string
  className: string
  children: React.ReactNode
} & Record<`data-${string}`, string | undefined> & { 'aria-current'?: 'true' }) {
  const row = useRef<HTMLLIElement>(null)
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const wheel = useRef({ x: 0, timer: undefined as ReturnType<typeof setTimeout> | undefined })
  const [dx, setDx] = useState(0)
  const [busy, setBusy] = useState<Move>()

  async function commit(move: Move) {
    if (busy || closed) return
    setBusy(move)
    const since = new Date().toISOString()
    try {
      if (move === 'done') await markDone(loopId)
      else await remindTomorrow(loopId)
      announceUndo({ loopId, previous: status, move, since })
    } finally {
      setBusy(undefined)
      setDx(0)
    }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLLIElement>) {
    if (closed || event.pointerType === 'mouse') return
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
  }
  function onPointerMove(event: ReactPointerEvent<HTMLLIElement>) {
    const s = start.current
    if (!s || event.pointerId !== s.id) return
    const mx = event.clientX - s.x
    const my = event.clientY - s.y
    if (Math.abs(my) > Math.abs(mx) && Math.abs(mx) < 12) return
    if (Math.abs(mx) > 8) row.current?.setPointerCapture(s.id)
    setDx(Math.max(-LIMIT, Math.min(LIMIT, mx)))
  }
  function onPointerUp(event: ReactPointerEvent<HTMLLIElement>) {
    const s = start.current
    if (!s || event.pointerId !== s.id) return
    start.current = null
    if (dx > THRESHOLD) void commit('done')
    else if (dx < -THRESHOLD) void commit('snooze')
    else setDx(0)
  }
  function onWheel(event: React.WheelEvent<HTMLLIElement>) {
    if (closed || Math.abs(event.deltaX) < Math.abs(event.deltaY)) return
    const w = wheel.current
    w.x = Math.max(-LIMIT, Math.min(LIMIT, w.x - event.deltaX))
    setDx(w.x)
    clearTimeout(w.timer)
    w.timer = setTimeout(() => {
      const x = w.x
      w.x = 0
      if (x > THRESHOLD) void commit('done')
      else if (x < -THRESHOLD) void commit('snooze')
      else setDx(0)
    }, 140)
  }

  const reveal = dx > 0 ? 'done' : dx < 0 ? 'snooze' : undefined
  const armed = Math.abs(dx) > THRESHOLD

  return (
    <li
      ref={row}
      className={className}
      data-reveal={reveal}
      data-armed={armed || undefined}
      data-busy={busy || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      {...rest}
    >
      <span className="swipe-under" aria-hidden="true">
        <span className="swipe-word" data-move="done">
          {WORD.done}
        </span>
        <span className="swipe-word" data-move="snooze">
          {WORD.snooze}
        </span>
      </span>
      <div className="swipe-face" style={dx ? { transform: `translateX(${dx}px)` } : undefined}>
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
