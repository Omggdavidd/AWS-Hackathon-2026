'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Notice } from '@/lib/notifications'

/** The chip on each line: the kind in words, coloured by the state palette so the list scans by colour. */
const KIND: Record<Notice['kind'], { label: string; state: string }> = {
  new: { label: 'New', state: 'new' },
  needs_you: { label: 'Needs you', state: 'needs-you' },
  resolved: { label: 'Done', state: 'resolved' },
  handled: { label: 'Handled', state: 'handled' },
  waiting: { label: 'Waiting', state: 'waiting' },
  watching: { label: 'Watching', state: 'watching' },
}

/**
 * The notification centre (SPEC §8H). It says what changed, never how much mail arrived, and every
 * line opens the responsibility it is about.
 *
 * Three deliberate quiet choices. The browser notification fires only while the tab is hidden: if
 * the page is in front of you, it already shows the change, and a second copy is noise. It fires
 * only for notices the Risk Judge flagged as worth interrupting for (SPEC §1), so the panel stays
 * the complete record while the shoulder tap stays rare. And permission is asked for from a button
 * inside the panel, never on load, so the first thing a new visitor sees is the product rather than
 * a permission prompt.
 */
export function NotificationBell({
  notices,
  unread,
  latestAt,
}: {
  notices: Notice[]
  unread: number
  latestAt?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const wrap = useRef<HTMLDivElement>(null)
  /** The newest notice already announced. Set on mount so history is never announced as news. */
  const announced = useRef<string | undefined>(undefined)

  useEffect(() => {
    setPermission(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission)
  }, [])

  useEffect(() => {
    const latest = notices[0]?.at
    if (!latest) return
    const previous = announced.current
    announced.current = latest
    if (previous === undefined || latest <= previous) return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (!document.hidden) return

    const fresh = notices.filter(
      (notice) => notice.at > previous && notice.unread && notice.interrupts,
    )
    if (fresh.length === 0) return
    const [first] = fresh
    const notification = new Notification(
      fresh.length === 1 && first ? first.title : `${fresh.length} things changed`,
      {
        body:
          fresh.length === 1 && first
            ? first.text
            : fresh
                .slice(0, 2)
                .map((notice) => notice.title)
                .join(', '),
        // One notification replaces the last rather than stacking through a four-minute scan.
        tag: 'openloop-changes',
        icon: '/icon.svg',
      },
    )
    notification.onclick = () => {
      window.focus()
      notification.close()
    }
  }, [notices])

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

  function markAllRead() {
    if (!latestAt) return
    // biome-ignore lint/suspicious/noDocumentCookie: matches the theme preference, read by the server.
    document.cookie = `openloops-seen=${encodeURIComponent(latestAt)}; Path=/; Max-Age=31536000; SameSite=Lax`
    router.refresh()
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') return
    setPermission(await Notification.requestPermission())
  }

  return (
    <div className="notice-wrap" ref={wrap}>
      <button
        type="button"
        className="notice-bell"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, nothing new'}
        onClick={() => setOpen((was) => !was)}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
          <path d="M10.5 19a1.8 1.8 0 0 0 3 0" />
        </svg>
        {unread > 0 && (
          <span className="notice-badge" aria-hidden="true">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="notice-panel" role="dialog" aria-label="Notifications">
          <div className="notice-head">
            <h2>What changed</h2>
            {unread > 0 && (
              <button type="button" className="notice-clear" onClick={markAllRead}>
                Mark all read
              </button>
            )}
          </div>

          {notices.length === 0 ? (
            <p className="notice-empty">Nothing has changed. The agent will say so when it does.</p>
          ) : (
            <ul className="notice-list">
              {notices.map((notice) => (
                <li key={notice.id} data-unread={notice.unread || undefined}>
                  <Link
                    href={`/loops/${notice.loopId}`}
                    onClick={close}
                    title={`${notice.title} ${notice.text}`}
                  >
                    <span className="notice-kind" data-state={KIND[notice.kind].state}>
                      {KIND[notice.kind].label}
                    </span>
                    <span className="notice-title">{notice.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {permission === 'default' && (
            <button type="button" className="notice-enable" onClick={enableNotifications}>
              Tell me on this device when something needs me
            </button>
          )}
          {permission === 'denied' && (
            <p className="notice-foot">
              Device notifications are blocked in your browser settings. The bell still works.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
