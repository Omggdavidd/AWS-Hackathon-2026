'use client'

import { useState } from 'react'

type Theme = 'light' | 'dark'

/** A server-read preference keeps the first paint and subsequent navigation in the chosen theme. */
export function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState(initialTheme)

  function toggle() {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.theme = next
    // biome-ignore lint/suspicious/noDocumentCookie: Persist the server-read preference in browsers without Cookie Store support.
    document.cookie = `openloops-theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`
    setTheme(next)
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {theme === 'light' ? (
          <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1 9 9 0 1 0 20.9 13.1Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </>
        )}
      </svg>
      <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
    </button>
  )
}
