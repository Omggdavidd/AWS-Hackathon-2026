import { describe, expect, it } from 'vitest'
import { fitCamera, restorePositions, zoomCamera } from './board'

describe('whiteboard layout', () => {
  const defaults = { needs: { x: 80, y: 90 }, resolved: { x: 900, y: 200 } }
  it('restores known positions and rejects corrupt or unbounded coordinates', () => {
    expect(restorePositions('{bad', defaults)).toEqual(defaults)
    expect(
      restorePositions('{"needs":{"x":42,"y":-15},"resolved":{"x":"bad","y":2}}', defaults),
    ).toEqual({ needs: { x: 42, y: -15 }, resolved: defaults.resolved })
    expect(restorePositions('{"needs":{"x":99999,"y":-99999},"unknown":{}}', defaults)).toEqual({
      needs: { x: 3000, y: -3000 },
      resolved: defaults.resolved,
    })
  })
  it('keeps a saved height only when it is a sane number', () => {
    expect(restorePositions('{"needs":{"x":1,"y":2,"h":640}}', defaults).needs).toEqual({
      x: 1,
      y: 2,
      h: 640,
    })
    expect(restorePositions('{"needs":{"x":1,"y":2,"h":"tall"}}', defaults).needs).toEqual({
      x: 1,
      y: 2,
    })
    expect(restorePositions('{"needs":{"x":1,"y":2,"h":99999}}', defaults).needs.h).toBe(2400)
  })
  it('fits a moved board, including negative positions, within the viewport', () => {
    const bounds = { x: -500, y: -200, width: 1400, height: 700 }
    const camera = fitCamera(bounds, 1200, 800)
    expect(bounds.x * camera.zoom + camera.x).toBeGreaterThanOrEqual(31)
    expect((bounds.x + bounds.width) * camera.zoom + camera.x).toBeLessThanOrEqual(1169)
    expect((bounds.y + bounds.height / 2) * camera.zoom + camera.y).toBe(400)
  })
  it('zooms about the pointer and bounds zoom', () => {
    const current = { x: -100, y: 30, zoom: 0.8 }
    const anchor = { x: 400, y: 300 }
    const next = zoomCamera(current, 1.2, anchor)
    expect((anchor.x - next.x) / next.zoom).toBeCloseTo((anchor.x - current.x) / current.zoom)
    expect((anchor.y - next.y) / next.zoom).toBeCloseTo((anchor.y - current.y) / current.zoom)
    expect(zoomCamera(current, 10, anchor).zoom).toBe(1.6)
  })
})
