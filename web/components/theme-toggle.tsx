'use client'

import { type MouseEvent, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

type Theme = 'light' | 'dark'

/** A server-read preference keeps the first paint and subsequent navigation in the chosen theme. */
export function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState(initialTheme)
  const transitioning = useRef(false)

  async function toggle(event: MouseEvent<HTMLButtonElement>) {
    if (transitioning.current) return
    const next = theme === 'light' ? 'dark' : 'light'
    const root = document.documentElement
    // biome-ignore lint/suspicious/noDocumentCookie: Persist the server-read preference in browsers without Cookie Store support.
    document.cookie = `openloops-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
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

    const { left, top, width, height } = event.currentTarget.getBoundingClientRect()
    const x = left + width / 2
    const y = top + height / 2
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

  return (
    <button
      type="button"
      className="theme-toggle"
      data-mode={theme}
      onClick={toggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <span className="theme-icons" aria-hidden="true">
        <span className="theme-icon theme-sun">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </svg>
        </span>
        <span className="theme-icon theme-moon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1 9 9 0 1 0 20.9 13.1Z" />
          </svg>
        </span>
      </span>
      <span className="theme-label">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
    </button>
  )
}
