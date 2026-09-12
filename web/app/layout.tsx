import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import { BottomTabs } from '@/components/bottom-tabs'
import { getStore, USER_ID } from '@/lib/ledger'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Open Loops',
  description: 'A follow-through agent that closes the open loops in your life.',
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const store = await getStore()
  const loops = await store.listLoops(USER_ID)
  const counts = {
    needsYou: loops.filter((l) => l.status === 'NEEDS_YOU').length,
    waiting: loops.filter((l) => l.status === 'WAITING').length,
    watching: loops.filter((l) => l.status === 'WATCHING').length,
  }
  const rail = [
    { href: '/#needs-you', label: 'Needs you', count: counts.needsYou },
    { href: '/#waiting', label: 'Waiting', count: counts.waiting },
    { href: '/#watching', label: 'Watching', count: counts.watching },
    { href: '/#resolved', label: 'Resolved' },
    { href: '/activity', label: 'Activity' },
  ]

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <header className="border-b border-border md:hidden">
          <div className="flex items-center justify-between px-4 py-3 text-sm">
            <Link href="/" className="font-semibold tracking-tight">
              Open Loops
            </Link>
            <Link href="/activity" className="text-muted">
              Activity
            </Link>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-5xl">
          <aside className="sticky top-0 hidden h-screen w-52 shrink-0 flex-col border-r border-border px-4 py-6 md:flex">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Open Loops
            </Link>
            <nav aria-label="Sections" className="mt-8 flex flex-col gap-1 text-sm">
              {rail.map((r) => (
                <Link
                  key={r.href}
                  href={r.href}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-muted hover:bg-card hover:text-foreground"
                >
                  <span>{r.label}</span>
                  {r.count !== undefined && r.count > 0 && (
                    <span className="text-xs tabular-nums">{r.count}</span>
                  )}
                </Link>
              ))}
            </nav>
            <p className="mt-auto text-xs text-muted">
              Inbox AI organizes messages. Open Loops manages responsibilities.
            </p>
          </aside>
          <main className="min-w-0 flex-1 px-4 pt-6 pb-24 md:px-10 md:py-10">{children}</main>
        </div>
        <BottomTabs counts={counts} />
      </body>
    </html>
  )
}
