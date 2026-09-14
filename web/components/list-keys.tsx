'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** How long the focus rests on a row before the pane follows it, so holding an arrow key is not a request per row. */
const FOLLOW_MS = 180

/**
 * Keyboard triage for the list, the way Linear and Todoist do it: arrow keys or J and K move
 * between rows and the pane follows the focused row, Enter opens the loop. Nothing on the list is
 * destructive, so no key closes a loop. Renders nothing; only listens.
 */
export function ListKeys() {
  const router = useRouter()
  useEffect(() => {
    let follow: ReturnType<typeof setTimeout> | undefined
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
        if (!row) return
        row.tabIndex = -1
        row.focus({ preventScroll: false })
        row.scrollIntoView({ block: 'nearest' })
        const id = row.dataset.loopId
        if (!id) return
        clearTimeout(follow)
        follow = setTimeout(() => router.replace(`/?loop=${id}`, { scroll: false }), FOLLOW_MS)
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
            all[current]?.querySelector<HTMLAnchorElement>('.tl-title')?.click()
          }
          break
        default:
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(follow)
      document.removeEventListener('keydown', onKey)
    }
  }, [router])
  return null
}
