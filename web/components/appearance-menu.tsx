'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  ACCENT_COOKIE,
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  DENSITY_COOKIE,
  type Density,
  HOME_COOKIE,
  type Home,
} from '@/lib/appearance'

const YEAR = 31536000

function store(name: string, value: string | undefined) {
  // biome-ignore lint/suspicious/noDocumentCookie: matches the theme preference, read by the server.
  document.cookie = value
    ? `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${YEAR}; SameSite=Lax`
    : `${name}=; Path=/; Max-Age=0; SameSite=Lax`
}

/**
 * Make it yours: the accent colour, how tight the rows sit, and which view opens first. Stored in
 * cookies beside the theme so the server paints the choice on the first byte. The four state
 * colours are not here on purpose; they carry meaning and stay fixed.
 */
export function AppearanceMenu({
  accent,
  density,
  home,
}: {
  accent: string | undefined
  density: Density
  home: Home
}) {
  const router = useRouter()
  const ref = useRef<HTMLDetailsElement>(null)
  const [custom, setCustom] = useState(accent ?? DEFAULT_ACCENT)

  useEffect(() => {
    const close = (event: Event) => {
      const el = ref.current
      if (el?.open && event.target instanceof Node && !el.contains(event.target)) el.open = false
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  function setAccent(hex: string | undefined) {
    document.documentElement.style.setProperty('--accent-base', hex ?? DEFAULT_ACCENT)
    if (hex) document.documentElement.dataset.accent = 'custom'
    else delete document.documentElement.dataset.accent
    store(ACCENT_COOKIE, hex)
    router.refresh()
  }
  function setDensity(next: Density) {
    document.documentElement.dataset.density = next
    store(DENSITY_COOKIE, next === 'compact' ? 'compact' : undefined)
    router.refresh()
  }
  function setHome(next: Home) {
    store(HOME_COOKIE, next === 'today' ? undefined : next)
    router.refresh()
  }

  const current = accent ?? DEFAULT_ACCENT
  const isPreset = ACCENT_PRESETS.some((p) => p.hex === current)

  return (
    <details className="appearance" ref={ref}>
      <summary aria-label="Appearance" title="Appearance">
        <span className="appearance-swatch" aria-hidden="true" />
        <span className="appearance-label">Appearance</span>
      </summary>
      <div className="appearance-panel">
        <fieldset className="appearance-group">
          <legend>Accent</legend>
          <div className="appearance-swatches">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="appearance-preset"
                style={{ '--swatch': p.hex } as React.CSSProperties}
                aria-pressed={current === p.hex}
                aria-label={p.name}
                title={p.name}
                onClick={() => {
                  setCustom(p.hex)
                  setAccent(p.hex === DEFAULT_ACCENT ? undefined : p.hex)
                }}
              />
            ))}
            <label
              className="appearance-custom"
              data-active={!isPreset || undefined}
              title="Custom colour"
            >
              <input
                id="appearance-custom"
                type="color"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onBlur={(e) => setAccent(e.target.value.toLowerCase())}
              />
              <span aria-hidden="true">+</span>
            </label>
          </div>
        </fieldset>
        <fieldset className="appearance-group">
          <legend>Rows</legend>
          <div className="appearance-choices">
            {(['comfortable', 'compact'] as Density[]).map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={density === d}
                onClick={() => setDensity(d)}
              >
                {d === 'compact' ? 'Compact' : 'Comfortable'}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="appearance-group">
          <legend>Opens on</legend>
          <div className="appearance-choices">
            {(['today', 'board', 'calendar'] as Home[]).map((h) => (
              <button key={h} type="button" aria-pressed={home === h} onClick={() => setHome(h)}>
                {h === 'today' ? 'Today' : h === 'board' ? 'Board' : 'Calendar'}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </details>
  )
}
