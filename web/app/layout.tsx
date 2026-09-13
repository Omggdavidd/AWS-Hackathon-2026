import type { Metadata } from 'next'
import { Geist_Mono, Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { AppRail, AppTabs } from '@/components/app-rail'
import { LoopMark } from '@/components/loop-mark'
import { NotificationBell } from '@/components/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { AGENT_COOKIE, cleanAgentName } from '@/lib/agent-name'
import { pendingDecisions } from '@/lib/decisions'
import { formatDateTime } from '@/lib/format'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'
import { buildNotices } from '@/lib/notifications'
import './globals.css'

const sans = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  axes: ['opsz'],
  display: 'swap',
})
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Open Loops',
  description: 'A follow-through agent that closes the open loops in your life.',
}

export const dynamic = 'force-dynamic'

/**
 * The shell: a rail of destinations on the left, a thin top bar with the agent's status, the bell
 * and the theme, and the page. Phones swap the rail for bottom tabs. State counts live in the
 * headline and on the rows, not in the navigation.
 */
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const jar = await cookies()
  const theme = jar.get('openloops-theme')?.value === 'dark' ? 'dark' : 'light'
  const agentName = cleanAgentName(jar.get(AGENT_COOKIE)?.value) ?? 'Your agent'
  const store = await getStore()
  const [loops, audit] = await Promise.all([
    store.listLoops(USER_ID),
    store.listAudit(USER_ID, { limit: 60 }),
  ])
  const [feed, decisions] = await Promise.all([
    buildNotices(audit, loops, jar.get('openloops-seen')?.value),
    pendingDecisions(store, USER_ID, loops),
  ])
  const lastScan = audit.find((event) => event.kind === 'scan_completed')
  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <div className="app-shell">
          <AppRail pending={decisions.length} initial={USER_NAME} />
          <div className="workspace">
            <header className="topbar">
              <Link href="/" className="wordmark topbar-wordmark">
                <LoopMark />
                <span>Open Loops</span>
              </Link>
              <p className="agent-status" data-tour="agent-status">
                <span className="agent-pulse" aria-hidden="true" />
                <span>
                  {agentName}
                  <small>
                    {lastScan ? ` checked ${formatDateTime(lastScan.at)}` : ' has not checked yet'}
                  </small>
                </span>
              </p>
              <div className="header-actions">
                <NotificationBell
                  notices={feed.notices}
                  unread={feed.unread}
                  latestAt={feed.latestAt}
                />
                <ThemeToggle initialTheme={theme} />
              </div>
            </header>
            <main id="main-content" className="main-content">
              {children}
            </main>
          </div>
        </div>
        <AppTabs pending={decisions.length} />
      </body>
    </html>
  )
}
