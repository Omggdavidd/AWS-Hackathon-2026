'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type TabCounts = { needsYou: number; waiting: number; watching: number }

/** Mobile-only bottom state tabs (SPEC §8 "Visual direction"); the desktop rail lives in the layout. */
export function BottomTabs({ counts }: { counts: TabCounts }) {
  const pathname = usePathname()
  const tabs = [
    { href: '/#needs-you', label: 'Needs you', count: counts.needsYou },
    { href: '/#waiting', label: 'Waiting', count: counts.waiting },
    { href: '/#watching', label: 'Watching', count: counts.watching },
    { href: '/activity', label: 'Activity' },
  ]
  return (
    <nav
      aria-label="States"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="grid grid-cols-4">
        {tabs.map((t) => {
          const active = t.href === '/activity' ? pathname === '/activity' : pathname === '/'
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active ? 'text-foreground' : 'text-muted'}`}
              >
                <span className="font-medium">{t.label}</span>
                {t.count !== undefined && (
                  <span className="text-[11px] tabular-nums">{t.count}</span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
