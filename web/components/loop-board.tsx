'use client'

import type { LoopStatus, OpenLoop } from '@openloop/shared'
import Link from 'next/link'
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import {
  type BoardPositions,
  type Camera,
  clamp,
  fitCamera,
  type Point,
  restorePositions,
  zoomCamera,
} from '@/lib/board'
import { DEMO_TIME_ZONE, formatDate, formatDue, formatMoney, groupByStatus } from '@/lib/format'
import { LiveClock } from './live-clock'
import { LoopMark, StateIcon } from './loop-mark'
import './loop-board.css'

const GROUPS: {
  id: string
  status: LoopStatus
  title: string
  hint: string
  empty: string
  position: Point
}[] = [
  {
    id: 'needs-you',
    status: 'NEEDS_YOU',
    title: 'Needs you',
    hint: 'Your move',
    empty: 'Nothing needs you.',
    position: { x: 40, y: 215 },
  },
  {
    id: 'waiting',
    status: 'WAITING',
    title: 'Waiting',
    hint: 'Their move next',
    empty: 'No one to chase.',
    position: { x: 375, y: 245 },
  },
  {
    id: 'watching',
    status: 'WATCHING',
    title: 'Watching',
    hint: 'No action needed now',
    empty: 'Nothing being watched.',
    position: { x: 710, y: 215 },
  },
  {
    id: 'resolved',
    status: 'RESOLVED',
    title: 'Resolved',
    hint: 'Closed by evidence or by you',
    empty: 'Closed loops land here.',
    position: { x: 1045, y: 245 },
  },
  {
    id: 'uncertain',
    status: 'UNCERTAIN',
    title: 'Uncertain',
    hint: 'A quick check would help',
    empty: '',
    position: { x: 375, y: 700 },
  },
]
const DEFAULTS = Object.fromEntries(GROUPS.map((g) => [g.id, g.position]))
const HUB = { x: 555, y: 26, width: 250, height: 150 }
const WIDTH = 300
const DOCK_INSET = 104
const groupHeight = (count: number, closed: boolean) =>
  closed ? 79 : 88 + Math.min(Math.max(count, 1) * 102, 322)
type Gesture = { id?: string; pointer: number; start: Point; origin: Point; active: boolean }
const DRAG_THRESHOLD = 6

/**
 * The overview as a whiteboard: state groups around a hub, arranged by the user and kept that way
 * (SPEC §7, §8A). Dragging changes presentation coordinates only; every card links to its loop.
 * The agent panel is docked at the bottom of the canvas so a scan or a catch-up never leaves the
 * board.
 */
export function LoopBoard({
  loops,
  now,
  name,
  checked,
  storageKey,
  agent,
}: {
  loops: OpenLoop[]
  now: string
  name: string
  checked?: string
  storageKey: string
  agent: ReactNode
}) {
  const groups = groupByStatus(loops)
  const visible = GROUPS.filter(
    (g) => g.status !== 'UNCERTAIN' || (groups.get(g.status)?.length ?? 0) > 0,
  )
  const [positions, setPositions] = useState<BoardPositions>(DEFAULTS)
  const positionsRef = useRef(positions)
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const cameraRef = useRef(camera)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState<string>()
  const [storageError, setStorageError] = useState(false)
  const [dockOpen, setDockOpen] = useState(true)
  const dockRef = useRef(true)
  const viewport = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const height = (id: string, count: number) => groupHeight(count, Boolean(collapsed[id]))

  const updateCamera = useCallback((next: Camera) => {
    cameraRef.current = next
    setCamera(next)
  }, [])
  function updatePositions(next: BoardPositions, save = false) {
    positionsRef.current = next
    setPositions(next)
    if (save) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
        setStorageError(false)
      } catch {
        setStorageError(true)
      }
    }
  }
  function toggleDock(open: boolean) {
    dockRef.current = open
    setDockOpen(open)
  }
  function fitBoard(nodes = positionsRef.current) {
    const el = viewport.current
    if (!el) return
    const x = Math.min(HUB.x, ...visible.map((g) => nodes[g.id].x)) - 20
    const y = Math.min(HUB.y, ...visible.map((g) => nodes[g.id].y)) - 30
    const right = Math.max(HUB.x + HUB.width, ...visible.map((g) => nodes[g.id].x + WIDTH)) + 20
    const bottom =
      Math.max(
        HUB.y + HUB.height,
        ...visible.map((g) => nodes[g.id].y + height(g.id, groups.get(g.status)?.length ?? 0)),
      ) + 25
    const inset = dockRef.current ? DOCK_INSET : 40
    const cam = fitCamera(
      { x, y, width: right - x, height: bottom - y },
      el.clientWidth,
      el.clientHeight - inset,
    )
    updateCamera({ ...cam, y: cam.y + 8 })
  }
  function focusGroup(id: string) {
    const el = viewport.current
    const group = visible.find((g) => g.id === id)
    if (!el || !group) return
    const point = positionsRef.current[id]
    updateCamera(
      fitCamera(
        { ...point, width: WIDTH, height: height(id, groups.get(group.status)?.length ?? 0) },
        el.clientWidth,
        el.clientHeight - (dockRef.current ? DOCK_INSET : 40),
      ),
    )
  }
  const resizeBoard = useEffectEvent((first: boolean, saved: BoardPositions) => {
    const el = viewport.current
    if (!el) return
    if (first && el.clientWidth < 700) {
      toggleDock(false)
      const p = saved['needs-you']
      const zoom = Math.min(1, (el.clientWidth - 40) / WIDTH)
      updateCamera({ zoom, x: el.clientWidth / 2 - (p.x + WIDTH / 2) * zoom, y: 24 - p.y * zoom })
    } else fitBoard(positionsRef.current)
    setReady(true)
  })
  const followHash = useEffectEvent(() => {
    const id = window.location.hash.slice(1)
    if (id) focusGroup(id)
  })
  useEffect(() => {
    if (!ready) return
    followHash()
    const navigate = () => followHash()
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [ready])
  // Read presentation-only coordinates after hydration; unavailable storage leaves a usable board.
  useEffect(() => {
    let saved = DEFAULTS
    try {
      saved = restorePositions(localStorage.getItem(storageKey), DEFAULTS)
    } catch {
      setStorageError(true)
    }
    positionsRef.current = saved
    setPositions(saved)
    const el = viewport.current
    if (!el) return
    let first = true
    const observer = new ResizeObserver(() => {
      resizeBoard(first, saved)
      first = false
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [storageKey])

  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const wheel = (event: WheelEvent) => {
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        event.target instanceof Element &&
        event.target.closest('.board-group-body, .board-dock')
      )
        return
      event.preventDefault()
      const current = cameraRef.current
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect()
        updateCamera(
          zoomCamera(current, current.zoom * Math.exp(-event.deltaY * 0.0025), {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          }),
        )
      } else updateCamera({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY })
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [updateCamera])

  function begin(event: PointerEvent<HTMLElement>, id?: string) {
    if (event.button !== 0 || gesture.current) return
    if (
      !id &&
      event.target instanceof Element &&
      event.target.closest('a,button,article,.board-dock,.board-canvas-tools')
    )
      return
    event.preventDefault()
    event.stopPropagation()
    if (id) event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = {
      id,
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: id ? positionsRef.current[id] : cameraRef.current,
      active: false,
    }
  }
  function move(event: PointerEvent) {
    const g = gesture.current
    if (!g || event.pointerId !== g.pointer) return
    const dx = event.clientX - g.start.x
    const dy = event.clientY - g.start.y
    if (!g.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      g.active = true
      setDragging(g.id ?? 'canvas')
    }
    if (g.id)
      updatePositions({
        ...positionsRef.current,
        [g.id]: {
          x: clamp(g.origin.x + dx / cameraRef.current.zoom, -3000, 3000),
          y: clamp(g.origin.y + dy / cameraRef.current.zoom, -3000, 3000),
        },
      })
    else updateCamera({ ...cameraRef.current, x: g.origin.x + dx, y: g.origin.y + dy })
  }
  function end(event: PointerEvent) {
    if (gesture.current?.pointer !== event.pointerId) return
    if (gesture.current.id && gesture.current.active) updatePositions(positionsRef.current, true)
    gesture.current = null
    setDragging(undefined)
  }
  function nudge(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    const deltas: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }
    const delta = deltas[event.key]
    if (!delta) return
    event.preventDefault()
    const p = positionsRef.current[id]
    const step = event.shiftKey ? 80 : 20
    updatePositions(
      {
        ...positionsRef.current,
        [id]: {
          x: clamp(p.x + delta.x * step, -3000, 3000),
          y: clamp(p.y + delta.y * step, -3000, 3000),
        },
      },
      true,
    )
  }
  function zoom(factor: number) {
    const el = viewport.current
    if (el)
      updateCamera(
        zoomCamera(cameraRef.current, cameraRef.current.zoom * factor, {
          x: el.clientWidth / 2,
          y: el.clientHeight / 2,
        }),
      )
  }
  const closed = groups.get('RESOLVED')?.length ?? 0
  const needs = (groups.get('NEEDS_YOU')?.length ?? 0) + (groups.get('UNCERTAIN')?.length ?? 0)
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: DEMO_TIME_ZONE,
    }).format(new Date(now)),
  )
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="mindboard">
      <div className="board-topline">
        <div className="board-title">
          <p className="board-date">
            <span>
              {new Date(now).toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
                timeZone: DEMO_TIME_ZONE,
              })}
            </span>
            <LiveClock timeZone={DEMO_TIME_ZONE} />
          </p>
          <h1>
            {greeting}, {name}.
          </h1>
        </div>
        <div className="board-top-actions">
          <nav className="board-view-switch" aria-label="View">
            <Link href="/">
              <StateIcon name="list" /> List
            </Link>
            <Link href="/?view=board" aria-current="page">
              <StateIcon name="overview" /> Board
            </Link>
            <Link href="/?view=calendar">
              <StateIcon name="calendar" /> Calendar
            </Link>
          </nav>
          <Link href="/activity" className="board-activity">
            <StateIcon name="activity" />
            Activity
          </Link>
        </div>
      </div>
      <nav className="board-state-nav" aria-label="Find a group">
        {visible.map((g) => (
          <button type="button" key={g.id} data-state={g.id} onClick={() => focusGroup(g.id)}>
            <span className="board-state-dot" />
            {g.title}
            <b>{groups.get(g.status)?.length ?? 0}</b>
          </button>
        ))}
        {storageError && (
          <span className="board-save-note">Layout is kept for this visit only.</span>
        )}
      </nav>
      <div
        className="board-viewport"
        ref={viewport}
        data-dragging={Boolean(dragging)}
        onPointerDown={(e) => begin(e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          className="board-plane"
          data-ready={ready}
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
        >
          <>
            <svg className="board-connections" aria-hidden="true">
              {visible.map((g) => {
                const p = positions[g.id]
                const startX = HUB.x + HUB.width / 2
                const startY = HUB.y + HUB.height
                const endX = p.x + WIDTH / 2
                const endY = p.y
                const middleY = startY + (endY - startY) * 0.5
                return (
                  <g key={g.id} data-state={g.id}>
                    <path
                      d={`M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`}
                    />
                    <circle cx={endX} cy={endY} r="4.5" />
                  </g>
                )
              })}
            </svg>
            <div className="board-hub" style={{ left: HUB.x, top: HUB.y }}>
              <span className="hub-mark">
                <LoopMark />
              </span>
              <p className="hub-headline">
                {needs > 0 ? (
                  <>
                    <strong>{needs}</strong> {needs === 1 ? 'thing needs' : 'things need'} you
                  </>
                ) : (
                  'Nothing needs you'
                )}
              </p>
              <p className="hub-sub">
                {closed} of {loops.length} closed
                {checked ? ` · checked ${checked}` : ''}
              </p>
            </div>
          </>
          {visible.map((g) => {
            const items = groups.get(g.status) ?? []
            const isCollapsed = Boolean(collapsed[g.id])
            return (
              <article
                key={g.id}
                id={`board-${g.id}`}
                className="board-group"
                data-state={g.id}
                data-dragging={dragging === g.id}
                style={{
                  left: positions[g.id].x,
                  top: positions[g.id].y,
                  height: height(g.id, items.length),
                }}
              >
                <div className="board-group-head">
                  <button
                    type="button"
                    className="board-drag-handle"
                    onPointerDown={(e) => begin(e, g.id)}
                    onKeyDown={(e) => nudge(e, g.id)}
                    aria-label={`Move ${g.title} group`}
                    aria-describedby="board-drag-help"
                  >
                    <span className="board-grip" aria-hidden="true">
                      ⠿
                    </span>
                  </button>
                  <div>
                    <h2>
                      <StateIcon name={g.id} />
                      {g.title}
                      <span>{items.length}</span>
                    </h2>
                    <p>{g.hint}</p>
                  </div>
                  <button
                    type="button"
                    className="board-fold"
                    aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${g.title}`}
                    aria-expanded={!isCollapsed}
                    aria-controls={`items-${g.id}`}
                    onClick={() => setCollapsed({ ...collapsed, [g.id]: !isCollapsed })}
                  >
                    {isCollapsed ? '+' : '−'}
                  </button>
                </div>
                <div id={`items-${g.id}`} className="board-group-body" hidden={isCollapsed}>
                  {items.length === 0 ? (
                    <p className="board-empty">{g.empty}</p>
                  ) : (
                    items.map((loop) => <BoardCard key={loop.id} loop={loop} now={now} />)
                  )}
                </div>
              </article>
            )
          })}
        </div>
        <fieldset className="board-canvas-tools" aria-label="Board controls">
          <button type="button" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">
            −
          </button>
          <output aria-label="Zoom level">{Math.round(camera.zoom * 100)}%</output>
          <button type="button" onClick={() => zoom(1.2)} aria-label="Zoom in">
            +
          </button>
          <span />
          <button type="button" onClick={() => fitBoard()}>
            Fit
          </button>
          <button
            type="button"
            onClick={() => {
              updatePositions(DEFAULTS, true)
              fitBoard(DEFAULTS)
            }}
          >
            Reset
          </button>
        </fieldset>
        <p className="board-gesture-hint" id="board-drag-help">
          Drag a handle to move a group. Drag the canvas to pan. Arrow keys move a focused handle.
        </p>
        <aside className="board-dock" data-open={dockOpen} aria-label="Your agent">
          <button
            type="button"
            className="board-dock-toggle"
            aria-expanded={dockOpen}
            onClick={() => toggleDock(!dockOpen)}
          >
            <span className="dock-dot" aria-hidden="true" />
            Your agent
            <span className="dock-chevron" aria-hidden="true">
              ⌄
            </span>
          </button>
          <div className="board-dock-body" hidden={!dockOpen}>
            {agent}
          </div>
        </aside>
      </div>
    </div>
  )
}

function BoardCard({ loop, now }: { loop: OpenLoop; now: string }) {
  const needs = loop.status === 'NEEDS_YOU' || loop.status === 'UNCERTAIN'
  const closed = loop.status === 'RESOLVED'
  const due = closed
    ? undefined
    : needs
      ? formatDue(loop.dueAt, new Date(now))
      : loop.dueAt
        ? formatDate(loop.dueAt, new Date(now))
        : undefined
  const source =
    loop.status === 'WAITING' && loop.waitingOn ? `With ${loop.waitingOn}` : loop.requestedBy
  return (
    <Link href={`/loops/${loop.id}`} className="board-card" title={loop.title} draggable={false}>
      <span className="board-card-title">
        {closed && (
          <span className="board-card-check" aria-hidden="true">
            ✓
          </span>
        )}
        {loop.title}
      </span>
      {source && <span className="board-card-source">{source}</span>}
      {(due || (!closed && loop.amount)) && (
        <span className="board-card-meta">
          {due && (
            <span
              className="board-due"
              data-urgent={
                needs && (due.includes('Overdue') || due === 'Due today' || due === 'Due tomorrow')
              }
            >
              {due}
            </span>
          )}
          {!closed && loop.amount && <span>{formatMoney(loop.amount)}</span>}
        </span>
      )}
    </Link>
  )
}
