'use client'

import type { LoopArea, LoopCategory, LoopStatus, OpenLoop } from '@openloop/shared'
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
  MAX_HEIGHT,
  MIN_HEIGHT,
  type Point,
  restorePositions,
  zoomCamera,
} from '@/lib/board'
import {
  AREA_LABEL,
  DEMO_TIME_ZONE,
  formatDate,
  formatDue,
  formatMoney,
  groupByStatus,
} from '@/lib/format'
import { LiveClock } from './live-clock'
import { LoopMark, StateIcon } from './loop-mark'
import './loop-board.css'

type Mode = 'state' | 'category' | 'area'

type Group = {
  id: string
  title: string
  hint: string
  empty: string
  position: Point
  /** Drives the group's color: a state id, or "category" for the neutral accent. */
  tone: string
  member: (loop: OpenLoop) => boolean
  /** Shown even when empty: the four states are the model, an empty state is news. */
  always: boolean
}

const STATE_ID: Record<LoopStatus, string> = {
  NEEDS_YOU: 'needs-you',
  WAITING: 'waiting',
  WATCHING: 'watching',
  RESOLVED: 'resolved',
  UNCERTAIN: 'uncertain',
}

const STATE_GROUPS: Group[] = (
  [
    ['NEEDS_YOU', 'Needs you', 'Your move', 'Nothing needs you.', { x: 40, y: 215 }, true],
    ['WAITING', 'Waiting', 'Their move next', 'No one to chase.', { x: 375, y: 245 }, true],
    [
      'WATCHING',
      'Watching',
      'No action needed now',
      'Nothing being watched.',
      { x: 710, y: 215 },
      true,
    ],
    [
      'RESOLVED',
      'Resolved',
      'Closed by evidence or by you',
      'Closed loops land here.',
      { x: 1045, y: 245 },
      true,
    ],
    ['UNCERTAIN', 'Uncertain', 'A quick check would help', '', { x: 375, y: 700 }, false],
  ] as const
).map(([status, title, hint, empty, position, always]) => ({
  id: STATE_ID[status],
  title,
  hint,
  empty,
  position,
  tone: STATE_ID[status],
  member: (loop) => loop.status === status,
  always,
}))

const CATEGORY_LABEL: Record<LoopCategory, [title: string, hint: string]> = {
  payment: ['Payments', 'Money that is due'],
  subscription: ['Subscriptions', 'Plans and renewals'],
  form: ['Forms', 'Things to sign or submit'],
  reply: ['Replies', 'Messages owed'],
  appointment: ['Appointments', 'Bookings and visits'],
  meeting: ['Meetings', 'Where to be, and when'],
  travel: ['Travel', 'Flights, stays, documents'],
  purchase: ['Purchases', 'Orders and returns'],
  admin: ['Admin', 'Paperwork and accounts'],
  other: ['Other', 'Everything else'],
}

const CATEGORY_GROUPS: Group[] = (Object.keys(CATEGORY_LABEL) as LoopCategory[]).map(
  (category, i) => ({
    id: `cat-${category}`,
    title: CATEGORY_LABEL[category][0],
    hint: CATEGORY_LABEL[category][1],
    empty: '',
    position: { x: 40 + (i % 4) * 335, y: 215 + Math.floor(i / 4) * 300 },
    tone: 'category',
    member: (loop) => loop.category === category,
    always: false,
  }),
)

const AREA_HINT: Record<LoopArea, string> = {
  school: 'Courses, credits, the registrar',
  work: 'Colleagues, clients, reviews',
  money: 'Bills, fees, subscriptions',
  health: 'Doctors, dentists, claims',
  home: 'Lease, utilities, moving',
  travel: 'Flights, documents, stays',
  community: 'Teams, volunteering, events',
  other: 'Everything else',
}

const AREA_GROUPS: Group[] = (Object.keys(AREA_HINT) as LoopArea[]).map((area, i) => ({
  id: `area-${area}`,
  title: AREA_LABEL[area],
  hint: AREA_HINT[area],
  empty: '',
  position: { x: 40 + (i % 4) * 335, y: 215 + Math.floor(i / 4) * 300 },
  tone: 'category',
  member: (loop) => loop.area === area,
  always: false,
}))

const GROUPS_BY_MODE: Record<Mode, Group[]> = {
  state: STATE_GROUPS,
  category: CATEGORY_GROUPS,
  area: AREA_GROUPS,
}

const DEFAULTS: BoardPositions = Object.fromEntries(
  [...STATE_GROUPS, ...CATEGORY_GROUPS, ...AREA_GROUPS].map((g) => [g.id, g.position]),
)
const HUB = { x: 555, y: 26, width: 250, height: 150 }
const WIDTH = 300
const DOCK_INSET = 104
const DRAG_THRESHOLD = 6
const groupHeight = (count: number) => 88 + Math.min(Math.max(count, 1) * 102, 322)
type Gesture = {
  kind: 'pan' | 'move' | 'resize'
  id?: string
  pointer: number
  start: Point
  origin: Point & { h?: number }
  active: boolean
}

/**
 * The overview as a whiteboard: groups around a hub, arranged by the user and kept that way
 * (SPEC §7, §8A). Groups are the four states or, with one switch, the loops' categories or areas
 * of life. Drag a
 * handle to move a group, its bottom edge to make it taller; nothing here changes a loop. The agent
 * panel is docked at the bottom of the canvas so a scan or a catch-up never leaves the board.
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
  const [mode, setMode] = useState<Mode>('state')
  const members = (g: Group) => loops.filter(g.member)
  const shownFor = (m: Mode) => GROUPS_BY_MODE[m].filter((g) => g.always || members(g).length > 0)
  const visible = shownFor(mode)
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
  const heightOf = (nodes: BoardPositions, g: Group) =>
    collapsed[g.id] ? 79 : (nodes[g.id]?.h ?? groupHeight(members(g).length))

  const updateCamera = useCallback((next: Camera) => {
    cameraRef.current = next
    setCamera(next)
  }, [])
  function persist(key: string, value: string) {
    try {
      localStorage.setItem(key, value)
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }
  function updatePositions(next: BoardPositions, save = false) {
    positionsRef.current = next
    setPositions(next)
    if (save) persist(storageKey, JSON.stringify(next))
  }
  function fitBoard(nodes = positionsRef.current, forMode = mode) {
    const el = viewport.current
    if (!el) return
    const shown = shownFor(forMode)
    const x = Math.min(HUB.x, ...shown.map((g) => nodes[g.id].x)) - 20
    const y = Math.min(HUB.y, ...shown.map((g) => nodes[g.id].y)) - 30
    const right = Math.max(HUB.x + HUB.width, ...shown.map((g) => nodes[g.id].x + WIDTH)) + 20
    const bottom =
      Math.max(HUB.y + HUB.height, ...shown.map((g) => nodes[g.id].y + heightOf(nodes, g))) + 25
    const inset = dockRef.current ? DOCK_INSET : 40
    const cam = fitCamera(
      { x, y, width: right - x, height: bottom - y },
      el.clientWidth,
      el.clientHeight - inset,
    )
    updateCamera({ ...cam, y: cam.y + 8 })
  }
  function switchMode(next: Mode) {
    setMode(next)
    persist(`${storageKey}:by`, next)
    requestAnimationFrame(() => fitBoard(positionsRef.current, next))
  }
  function toggleDock(open: boolean) {
    dockRef.current = open
    setDockOpen(open)
  }
  function focusGroup(id: string) {
    const el = viewport.current
    const group = visible.find((g) => g.id === id)
    if (!el || !group) return
    const point = positionsRef.current[id]
    updateCamera(
      fitCamera(
        { ...point, width: WIDTH, height: heightOf(positionsRef.current, group) },
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
  // Read presentation-only layout after hydration; unavailable storage leaves a usable board.
  useEffect(() => {
    let saved = DEFAULTS
    try {
      saved = restorePositions(localStorage.getItem(storageKey), DEFAULTS)
      const by = localStorage.getItem(`${storageKey}:by`)
      if (by === 'category' || by === 'area') setMode(by)
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

  function begin(event: PointerEvent<HTMLElement>, kind: Gesture['kind'], group?: Group) {
    if (event.button !== 0 || gesture.current) return
    if (
      kind === 'pan' &&
      event.target instanceof Element &&
      event.target.closest('a,button,article,.board-dock,.board-canvas-tools')
    )
      return
    event.preventDefault()
    event.stopPropagation()
    if (group) event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    const node = group ? positionsRef.current[group.id] : undefined
    gesture.current = {
      kind,
      id: group?.id,
      pointer: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin:
        kind === 'pan' || !group || !node
          ? cameraRef.current
          : { x: node.x, y: node.y, h: heightOf(positionsRef.current, group) },
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
    const zoom = cameraRef.current.zoom
    if (g.kind === 'move' && g.id)
      updatePositions({
        ...positionsRef.current,
        [g.id]: {
          ...positionsRef.current[g.id],
          x: clamp(g.origin.x + dx / zoom, -3000, 3000),
          y: clamp(g.origin.y + dy / zoom, -3000, 3000),
        },
      })
    else if (g.kind === 'resize' && g.id)
      updatePositions({
        ...positionsRef.current,
        [g.id]: {
          ...positionsRef.current[g.id],
          h: clamp((g.origin.h ?? 0) + dy / zoom, MIN_HEIGHT, MAX_HEIGHT),
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
          ...p,
          x: clamp(p.x + delta.x * step, -3000, 3000),
          y: clamp(p.y + delta.y * step, -3000, 3000),
        },
      },
      true,
    )
  }
  function stretch(event: KeyboardEvent<HTMLButtonElement>, group: Group) {
    const delta = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    event.preventDefault()
    const step = event.shiftKey ? 120 : 40
    updatePositions(
      {
        ...positionsRef.current,
        [group.id]: {
          ...positionsRef.current[group.id],
          h: clamp(heightOf(positionsRef.current, group) + delta * step, MIN_HEIGHT, MAX_HEIGHT),
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
    <div className="mindboard" data-mode={mode}>
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
      </div>
      <nav className="board-state-nav" aria-label="Find a group">
        <fieldset className="board-groupby" aria-label="Group by">
          <button type="button" aria-pressed={mode === 'state'} onClick={() => switchMode('state')}>
            By state
          </button>
          <button
            type="button"
            aria-pressed={mode === 'category'}
            onClick={() => switchMode('category')}
          >
            By category
          </button>
          <button type="button" aria-pressed={mode === 'area'} onClick={() => switchMode('area')}>
            By area
          </button>
        </fieldset>
        {visible.map((g) => (
          <button type="button" key={g.id} data-state={g.tone} onClick={() => focusGroup(g.id)}>
            <span className="board-state-dot" />
            {g.title}
            <b>{members(g).length}</b>
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
        onPointerDown={(e) => begin(e, 'pan')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div
          className="board-plane"
          data-ready={ready}
          style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}
        >
          <svg className="board-connections" aria-hidden="true">
            {visible.map((g) => {
              const p = positions[g.id]
              const startX = HUB.x + HUB.width / 2
              const startY = HUB.y + HUB.height
              const endX = p.x + WIDTH / 2
              const endY = p.y
              const middleY = startY + (endY - startY) * 0.5
              return (
                <g key={g.id} data-state={g.tone}>
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
          {visible.map((g) => {
            const items = members(g)
            const isCollapsed = Boolean(collapsed[g.id])
            return (
              <article
                key={g.id}
                id={`board-${g.id}`}
                className="board-group"
                data-state={g.tone}
                data-dragging={dragging === g.id}
                style={{
                  left: positions[g.id].x,
                  top: positions[g.id].y,
                  height: heightOf(positions, g),
                }}
              >
                <div className="board-group-head">
                  <button
                    type="button"
                    className="board-drag-handle"
                    onPointerDown={(e) => begin(e, 'move', g)}
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
                      {g.tone !== 'category' && <StateIcon name={g.tone} />}
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
                    items.map((loop) => (
                      <BoardCard key={loop.id} loop={loop} now={now} showState={mode !== 'state'} />
                    ))
                  )}
                </div>
                {!isCollapsed && (
                  <button
                    type="button"
                    className="board-resize"
                    onPointerDown={(e) => begin(e, 'resize', g)}
                    onKeyDown={(e) => stretch(e, g)}
                    aria-label={`Resize ${g.title} group`}
                    title="Drag to show more"
                  />
                )}
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
          Drag a handle to move a group, its bottom edge to show more. Drag the canvas to pan. Arrow
          keys move a focused handle.
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

function BoardCard({ loop, now, showState }: { loop: OpenLoop; now: string; showState: boolean }) {
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
    <Link
      href={`/loops/${loop.id}`}
      className="board-card"
      data-state={STATE_ID[loop.status]}
      title={loop.title}
      draggable={false}
    >
      <span className="board-card-title">
        {showState ? (
          <span className="board-card-state" role="img" aria-label={loop.status.replace('_', ' ')}>
            <StateIcon name={STATE_ID[loop.status]} />
          </span>
        ) : (
          closed && (
            <span className="board-card-check" aria-hidden="true">
              ✓
            </span>
          )
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
