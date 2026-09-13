'use client'

import { useEffect } from 'react'

/**
 * Keyboard triage for the list, the way Linear and Todoist do it: arrow keys or J and K move
 * between rows, Enter opens the loop, D marks it done. Renders nothing; only listens.
 */
export function ListKeys() {
  useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLElement>('.tl-row')]
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.closest('input, textarea, select, [contenteditable]') || event.metaKey))
        return
      const all = rows()
      if (all.length === 0) return
      const current = all.findIndex((row) => row.contains(document.activeElement))
      const focusRow = (index: number) => {
        const row = all[Math.max(0, Math.min(all.length - 1, index))]
        row.tabIndex = -1
        row.focus({ preventScroll: false })
        row.scrollIntoView({ block: 'nearest' })
      }
      switch (event.key) {
        case 'ArrowDown':
        case 'j':
          event.preventDefault()
          focusRow(current + 1)
          break
        case 'ArrowUp':
        case 'k':
          event.preventDefault()
          focusRow(current <= 0 ? 0 : current - 1)
          break
        case 'Enter':
          if (current >= 0 && target?.classList.contains('tl-row')) {
            event.preventDefault()
            all[current].querySelector<HTMLAnchorElement>('.tl-title')?.click()
          }
          break
        case 'd':
          if (current >= 0) {
            event.preventDefault()
            all[current].querySelector<HTMLFormElement>('.tl-done')?.requestSubmit()
          }
          break
        default:
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return null
}
