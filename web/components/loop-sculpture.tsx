'use client'

import { useEffect, useRef, useState } from 'react'
import { LoopMark } from './loop-mark'

type Point = [number, number, number]
type Face = { points: Point[]; normal: Point; ring: number }

// A pair of linked, open tori. Geometry is built once; only the camera turns.
function createLoops(): Face[] {
  const faces: Face[] = []
  const segments = 72
  const sides = 20
  for (let ring = 0; ring < 2; ring++) {
    const point = (u: number, v: number, normal = false): Point => {
      const radius = normal ? Math.cos(v) : 1 + 0.16 * Math.cos(v)
      const x = radius * Math.cos(u) + (normal ? 0 : ring === 0 ? -0.58 : 0.58)
      const y = radius * Math.sin(u)
      const z = (normal ? 1 : 0.16) * Math.sin(v)
      return ring === 0 ? [x, y, z] : [x, z, y]
    }
    const angle = (i: number) => 0.28 + (i / segments) * (Math.PI * 2 - 0.56)
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < sides; j++) {
        const u = angle(i)
        const nextU = angle(i + 1)
        const v = (j / sides) * Math.PI * 2
        const nextV = ((j + 1) / sides) * Math.PI * 2
        faces.push({
          ring,
          normal: point((u + nextU) / 2, (v + nextV) / 2, true),
          points: [point(u, v), point(nextU, v), point(nextU, nextV), point(u, nextV)],
        })
      }
    }
    for (const end of [0, segments]) {
      const u = angle(end)
      const direction = end === 0 ? -1 : 1
      const tangent: Point = [-Math.sin(u) * direction, Math.cos(u) * direction, 0]
      faces.push({
        ring,
        normal: ring === 0 ? tangent : [tangent[0], 0, tangent[1]],
        points: Array.from({ length: sides }, (_, j) => point(u, (j / sides) * Math.PI * 2)),
      })
    }
  }
  return faces
}

const faces = createLoops()

function draw(canvas: HTMLCanvasElement, angle: number) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rotate = ([x, y, z]: Point): Point => {
    const a = angle + 0.48
    const rx = x * Math.cos(a) + z * Math.sin(a)
    const rz = -x * Math.sin(a) + z * Math.cos(a)
    const ry = y * Math.cos(-0.5) - rz * Math.sin(-0.5)
    const depth = y * Math.sin(-0.5) + rz * Math.cos(-0.5)
    return [
      rx * Math.cos(-0.35) - ry * Math.sin(-0.35),
      rx * Math.sin(-0.35) + ry * Math.cos(-0.35),
      depth,
    ]
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const projected = faces
    .map((face) => {
      const points = face.points.map(rotate)
      return {
        ...face,
        points,
        normal: rotate(face.normal),
        depth: points.reduce((sum, p) => sum + p[2], 0) / points.length,
      }
    })
    .sort((a, b) => a.depth - b.depth)
  for (const face of projected) {
    const light = Math.max(
      0,
      -face.normal[0] * 0.35 - face.normal[1] * 0.55 + face.normal[2] * 0.76,
    )
    const shine = 62 * light ** 16
    const base = face.ring === 0 ? [30, 123, 137] : [146, 168, 179]
    const color = base.map((c) => Math.min(255, c * (0.48 + light * 0.65) + shine))
    ctx.fillStyle = `rgb(${color.join(',')})`
    ctx.strokeStyle = ctx.fillStyle
    ctx.lineWidth = 0.65
    ctx.beginPath()
    face.points.forEach(([x, y, z], i) => {
      const scale = canvas.width * 0.185 * (6 / (6 - z))
      const px = canvas.width / 2 + x * scale
      const py = canvas.height / 2 + y * scale
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}

/** Decoration only: no ledger state, external assets, or animation dependencies. */
export function LoopSculpture() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const angleRef = useRef(0)
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas?.getContext('2d')) return
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let previous = 0
    let visible = true
    const tick = (time: number) => {
      if (time - previous >= 1000 / 24) {
        angleRef.current += Math.min(time - previous, 60) * 0.00015
        draw(canvas, angleRef.current)
        previous = time
      }
      frame = requestAnimationFrame(tick)
    }
    const sync = () => {
      cancelAnimationFrame(frame)
      previous = 0
      setReduced(preference.matches)
      draw(canvas, angleRef.current)
      if (!paused && !preference.matches && !document.hidden && visible)
        frame = requestAnimationFrame(tick)
    }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      sync()
    })
    observer.observe(canvas)
    preference.addEventListener('change', sync)
    document.addEventListener('visibilitychange', sync)
    sync()
    setReady(true)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      preference.removeEventListener('change', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  }, [paused])

  return (
    <div className="loop-sculpture">
      <div className="sculpture-stage" aria-hidden="true">
        {!ready && <LoopMark />}
        <canvas ref={canvasRef} width="640" height="440" />
      </div>
      {ready && !reduced && (
        <button
          className="motion-toggle"
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Play loop animation' : 'Pause loop animation'}
        >
          <span aria-hidden="true">{paused ? '▷' : 'Ⅱ'}</span>{' '}
          {paused ? 'Play motion' : 'Pause motion'}
        </button>
      )}
    </div>
  )
}
