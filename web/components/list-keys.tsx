'use client'

import { useEffect } from 'react'

/**
 * Keyboard triage for the list, the way Linear and Todoist do it: arrow keys or J and K move the
 * focus between rows, Enter opens the focused loop. Moving never opens anything, so reading down
 * the list with the arrows does not throw a loop over it. Keys pressed inside the loop pane belong
 * to the pane. Nothing on the list is destructive, so no key
 * closes a loop. Renders nothing; only listens.
 */
export function ListKeys() {
  useEffect(() => {
    const rows = () => [...document.querySelectorAll<HTMLElement>('.tl-row')]
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (target?.closest('input, textarea, select, [contenteditable], .pane, [role="dialog"]'))
        return
      // Below the split breakpoint the loop is a sheet over the list; the list behind it is not in play.
      const pane = document.querySelector('.pane')
      if (pane && getComputedStyle(pane).position === 'fixed') return
      const all = rows()
      if (all.length === 0) return
      const focused = all.findIndex((row) => row.contains(document.activeElement))
      // With nothing focused, start from the loop open in the pane, so Down means "the next one".
      const current =
        focused >= 0 ? focused : all.findIndex((row) => row.dataset.selected !== undefined)
      const focusRow = (index: number) => {
        const row = all[Math.max(0, Math.min(all.length - 1, index))]
        if (!row) return
        row.tabIndex = -1
        row.focus({ preventScroll: true })
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
          if (focused >= 0 && target?.classList.contains('tl-row')) {
            event.preventDefault()
            all[focused]?.querySelector<HTMLAnchorElement>('.tl-title')?.click()
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
