'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LoopMark, StateIcon } from './loop-mark'

type Item = { id: string; href: string; label: string; icon: string; count?: number }

function items(pending: number): Item[] {
  return [
    { id: 'today', href: '/', label: 'Today', icon: 'list' },
    { id: 'board', href: '/board', label: 'Board', icon: 'overview' },
    { id: 'calendar', href: '/calendar', label: 'Calendar', icon: 'calendar' },
    { id: 'decisions', href: '/decisions', label: 'Decisions', icon: 'decisions', count: pending },
    { id: 'activity', href: '/activity', label: 'Activity', icon: 'activity' },
    { id: 'about', href: '/about', label: 'About', icon: 'about' },
  ]
}

function isActive(item: Item, pathname: string): boolean {
  if (item.href === '/') return pathname === '/' || pathname.startsWith('/loops')
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

/**
 * Primary navigation: every destination is a route, one icon and one word each, the way Linear
 * and Notion Calendar keep a rail. State counts are not destinations, so they live on the rows
 * and in the headline, not here. The Decisions item carries the one count that is an inbox.
 */
export function AppRail({ pending, initial }: { pending: number; initial: string }) {
  const pathname = usePathname()
  return (
    <nav className="rail" aria-label="Primary">
      <Link href="/" className="rail-mark" aria-label="Open Loops, today">
        <LoopMark />
      </Link>
      <ul data-tour="views">
        {items(pending).map((item) => {
          const active = isActive(item, pathname)
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="rail-item"
                data-active={active || undefined}
                aria-current={active ? 'page' : undefined}
                data-tour={item.id === 'decisions' ? 'decisions' : undefined}
              >
                <StateIcon name={item.icon} />
                <span>{item.label}</span>
                {item.count ? <b className="rail-count">{item.count}</b> : null}
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="rail-foot">
        <span className="avatar" title={initial}>
          {initial[0]}
        </span>
      </div>
    </nav>
  )
}

/** The same destinations as a phone's bottom bar, without About, which the header's wordmark covers. */
export function AppTabs({ pending }: { pending: number }) {
  const pathname = usePathname()
  return (
    <nav className="bottom-tabs" aria-label="Primary" data-tour="views">
      {items(pending)
        .filter((item) => item.id !== 'about')
        .map((item) => {
          const active = isActive(item, pathname)
          return (
            <Link
              key={item.id}
              href={item.href}
              className="nav-item"
              data-active={active}
              aria-current={active ? 'page' : undefined}
            >
              <StateIcon name={item.icon} />
              <span>{item.label}</span>
              {item.count ? <span className="nav-count">{item.count}</span> : null}
            </Link>
          )
        })}
    </nav>
  )
}
