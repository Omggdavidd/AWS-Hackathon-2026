export type Point = { x: number; y: number }
export type Camera = Point & { zoom: number }
export type BoardPositions = Record<string, Point>
export type Bounds = Point & { width: number; height: number }
export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

/** Saved layout is untrusted browser data; retain only known nodes and finite coordinates. */
export function restorePositions(raw: string | null, defaults: BoardPositions): BoardPositions {
  if (!raw) return { ...defaults }
  try {
    const parsed = JSON.parse(raw)
    return Object.fromEntries(
      Object.entries(defaults).map(([id, fallback]) => {
        const p = parsed?.[id]
        return [
          id,
          p && Number.isFinite(p.x) && Number.isFinite(p.y)
            ? { x: clamp(p.x, -3000, 3000), y: clamp(p.y, -3000, 3000) }
            : fallback,
        ]
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
