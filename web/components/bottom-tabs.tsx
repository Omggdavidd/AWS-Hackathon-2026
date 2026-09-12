'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { StateIcon } from './loop-mark'

export type TabCounts = {
  needsYou: number
  waiting: number
  watching: number
  resolved: number
  uncertain: number
}

export function WorkspaceNav({ counts, mobile = false }: { counts: TabCounts; mobile?: boolean }) {
  const pathname = usePathname()
  const [hash, setHash] = useState('')
  useEffect(() => {
    const update = () => {
      setHash(window.location.hash)
      if (pathname === '/' && window.location.hash === '#resolved') {
        const resolved = document.querySelector<HTMLDetailsElement>('details#resolved')
        if (resolved) resolved.open = true
      }
    }
    // Clicking a shortcut again must reopen a manually collapsed resolved section.
    const reveal = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || pathname !== '/') return
      if (event.target.closest('a[href="#resolved"], a[href="/#resolved"]')) {
        const resolved = document.querySelector<HTMLDetailsElement>('details#resolved')
        if (resolved) resolved.open = true
      }
    }
    update()
    window.addEventListener('hashchange', update)
    document.addEventListener('click', reveal)
    return () => {
      window.removeEventListener('hashchange', update)
      document.removeEventListener('click', reveal)
    }
  }, [pathname])
  const tabs = [
    ...(!mobile ? [{ id: 'overview', href: '/', label: 'Overview', count: undefined }] : []),
    { id: 'needs-you', href: '/#needs-you', label: 'Needs you', count: counts.needsYou },
    { id: 'waiting', href: '/#waiting', label: 'Waiting', count: counts.waiting },
    { id: 'watching', href: '/#watching', label: 'Watching', count: counts.watching },
    ...(!mobile
      ? [{ id: 'resolved', href: '/#resolved', label: 'Resolved', count: counts.resolved }]
      : []),
    ...(!mobile && counts.uncertain > 0
      ? [{ id: 'uncertain', href: '/#uncertain', label: 'Uncertain', count: counts.uncertain }]
      : []),
    { id: 'activity', href: '/activity', label: 'Activity', count: undefined },
  ]
  return (
    <nav
      aria-label={mobile ? 'States' : 'Workspace'}
      className={mobile ? 'bottom-tabs' : 'workspace-nav'}
    >
      {tabs.map((tab) => {
        const active =
          tab.id === 'activity'
            ? pathname === '/activity'
            : pathname === '/' &&
              (hash === `#${tab.id}` || (!hash && tab.id === (mobile ? 'needs-you' : 'overview')))
        const content = (
          <>
            <StateIcon name={tab.id} />
            <span>{tab.label}</span>
            {tab.count !== undefined && <span className="nav-count">{tab.count}</span>}
          </>
        )
        const props = {
          className: 'nav-item',
          'data-active': active,
          'data-state': tab.id,
          'aria-current': active ? ('location' as const) : undefined,
        }
        return tab.href.includes('#') ? (
          <a key={tab.id} href={tab.href} {...props}>
            {content}
          </a>
        ) : (
          <Link key={tab.id} href={tab.href} {...props}>
            {content}
          </Link>
        )
      })}
    </nav>
  )
}

export function BottomTabs({ counts }: { counts: TabCounts }) {
  return <WorkspaceNav counts={counts} mobile />
}
