export type Point = { x: number; y: number }
export type Camera = Point & { zoom: number }
/** A group's saved place on the board, and its height once the user has resized it. */
export type Node = Point & { h?: number }
export type BoardPositions = Record<string, Node>
export type Bounds = Point & { width: number; height: number }
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
/** A group can be dragged down to show everything it holds, within reason. */
export const MIN_HEIGHT = 120
export const MAX_HEIGHT = 2400

/** Saved layout is untrusted browser data; retain only known nodes and finite coordinates. */
export function restorePositions(raw: string | null, defaults: BoardPositions): BoardPositions {
  if (!raw) return { ...defaults }
  try {
    const parsed = JSON.parse(raw)
    return Object.fromEntries(
      Object.entries(defaults).map(([id, fallback]) => {
        const p = parsed?.[id]
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return [id, fallback]
        const node: Node = { x: clamp(p.x, -3000, 3000), y: clamp(p.y, -3000, 3000) }
        if (Number.isFinite(p.h)) node.h = clamp(p.h, MIN_HEIGHT, MAX_HEIGHT)
        return [id, node]
      }),
    )
  } catch {
    return { ...defaults }
  }
}
export function fitCamera(bounds: Bounds, width: number, height: number): Camera {
  const zoom = clamp(Math.min((width - 64) / bounds.width, (height - 64) / bounds.height), 0.2, 1)
  return {
    zoom,
    x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
  }
}
/** Keep the board point underneath the cursor stationary while zooming. */
export function zoomCamera(camera: Camera, zoom: number, anchor: Point): Camera {
  const next = clamp(zoom, 0.2, 1.6)
  return {
    zoom: next,
    x: anchor.x - ((anchor.x - camera.x) * next) / camera.zoom,
    y: anchor.y - ((anchor.y - camera.y) * next) / camera.zoom,
  }
}
