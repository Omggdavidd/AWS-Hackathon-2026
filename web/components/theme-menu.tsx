'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { THEME_COOKIE, THEMES, type Theme } from '@/lib/appearance'

/** One glyph per ground, cross-faded on the button so it always shows the mode you are in. */
const ICON: Record<Theme, React.ReactNode> = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
    </>
  ),
  dark: <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1 9 9 0 1 0 20.9 13.1Z" />,
  midnight: (
    <>
      <path d="M20.4 14.3A8 8 0 0 1 9.7 3.6 8 8 0 1 0 20.4 14.3Z" />
      <path d="M17.5 3v2.4M16.3 4.2h2.4M6 6.6v1.6M5.2 7.4h1.6" />
    </>
  ),
}

function Glyph({ theme }: { theme: Theme }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON[theme]}
    </svg>
  )
}

/**
 * Three grounds behind one control. The button opens the list and changes nothing on its own; the
 * reveal only plays when a mode is actually picked, so opening the menu to check which one you are
 * in never flashes the page. The current mode is marked in the list, so coming back to the menu
 * answers "which am I on?" before you read a word.
 *
 * The preference is a cookie the server reads, which is what keeps the first paint and every
 * navigation in the chosen ground rather than flashing light first.
 */
export function ThemeMenu({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState(initialTheme)
  const [open, setOpen] = useState(false)
  const transitioning = useRef(false)
  const wrap = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    function onPointer(event: PointerEvent) {
      if (!wrap.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open, close])

  async function pick(next: Theme, origin: DOMRect) {
    setOpen(false)
    if (next === theme || transitioning.current) return
    const root = document.documentElement
    // biome-ignore lint/suspicious/noDocumentCookie: Persist the server-read preference in browsers without Cookie Store support.
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
    const applyTheme = () => {
      // Capture the new page and control together in the browser's transition snapshot.
      flushSync(() => {
        root.dataset.theme = next
        setTheme(next)
      })
    }
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      applyTheme()
      return
    }

    // The reveal grows from the option that was clicked, so the new ground comes out of the choice.
    const x = origin.left + origin.width / 2
    const y = origin.top + origin.height / 2
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    root.style.setProperty('--theme-x', `${x}px`)
    root.style.setProperty('--theme-y', `${y}px`)
    root.style.setProperty('--theme-radius', `${radius}px`)
    root.dataset.themeTransition = 'true'
    transitioning.current = true
    try {
      await document.startViewTransition(applyTheme).finished
    } catch {
      // A hidden tab or an interrupted snapshot must not prevent changing the preference.
      applyTheme()
    } finally {
      delete root.dataset.themeTransition
      for (const property of ['--theme-x', '--theme-y', '--theme-radius']) {
        root.style.removeProperty(property)
      }
      transitioning.current = false
    }
  }

  const current = THEMES.find((mode) => mode.id === theme) ?? THEMES[0]

  return (
    <div className="theme-wrap" ref={wrap}>
      <button
        type="button"
        className="theme-toggle"
        data-mode={theme}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Display mode: ${current?.name}. Change it`}
        title={`Display mode: ${current?.name}`}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="theme-icons" aria-hidden="true">
          {THEMES.map((mode) => (
            <span key={mode.id} className="theme-icon" data-for={mode.id}>
              <Glyph theme={mode.id} />
            </span>
          ))}
        </span>
        <span className="theme-label">{current?.name}</span>
      </button>

      {open && (
        <div className="theme-panel" role="menu" aria-label="Display mode">
          {THEMES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === mode.id}
              data-active={theme === mode.id || undefined}
              className="theme-option"
              onClick={(event) => pick(mode.id, event.currentTarget.getBoundingClientRect())}
            >
              <span className="theme-option-glyph" data-for={mode.id} aria-hidden="true">
                <Glyph theme={mode.id} />
              </span>
              <span className="theme-option-text">
                <strong>{mode.name}</strong>
                <small>{mode.hint}</small>
              </span>
              <span className="theme-option-tick" aria-hidden="true">
                <svg
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m3.5 8.5 3 3 6-7" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
