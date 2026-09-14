import type { Metadata } from 'next'
import { Geist_Mono, Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { AppRail, AppTabs } from '@/components/app-rail'
import { AppearanceMenu } from '@/components/appearance-menu'
import { CommandBar } from '@/components/command-bar'
import { LoopMark } from '@/components/loop-mark'
import { NotificationBell } from '@/components/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { Welcome } from '@/components/welcome'
import { scanConfigured } from '@/lib/agent'
import { AGENT_COOKIE, cleanAgentName } from '@/lib/agent-name'
import {
  ACCENT_COOKIE,
  DEFAULT_ACCENT,
  DENSITY_COOKIE,
  HOME_COOKIE,
  parseAccent,
  parseDensity,
  parseHome,
} from '@/lib/appearance'
import { formatDateTime } from '@/lib/format'
import { loadAudit, loadDecisions, loadLoops, USER_ID } from '@/lib/ledger'
import { buildNotices } from '@/lib/notifications'
import { purposeLabel, readProfile } from '@/lib/profile'
import { readRuntimeMode } from '@/lib/runtime-lock'
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
  const named = cleanAgentName(jar.get(AGENT_COOKIE)?.value)
  const agentName = named ?? 'Your agent'
  const accent = parseAccent(jar.get(ACCENT_COOKIE)?.value)
  const density = parseDensity(jar.get(DENSITY_COOKIE)?.value)
  const home = parseHome(jar.get(HOME_COOKIE)?.value)
  const todayHref = home === 'today' ? '/' : '/?view=list'
  const profile = readProfile(jar)
  const [loops, audit, runtimeMode] = await Promise.all([
    loadLoops(USER_ID),
    loadAudit(USER_ID),
    readRuntimeMode(),
  ])
  const [feed, decisions] = await Promise.all([
    buildNotices(audit, loops, jar.get('openloops-seen')?.value),
    loadDecisions(USER_ID),
  ])
  const lastScan = audit.find((event) => event.kind === 'scan_completed')
  return (
    <html
      lang="en"
      data-theme={theme}
      data-accent={accent ? 'custom' : undefined}
      data-density={density === 'compact' ? 'compact' : undefined}
      style={{ '--accent-base': accent ?? DEFAULT_ACCENT } as React.CSSProperties}
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <div className="app-shell">
          <AppRail pending={decisions.length} initial={profile.name} todayHref={todayHref} />
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
                    {runtimeMode !== 'open'
                      ? ` is paused (${runtimeMode})`
                      : lastScan
                        ? ` checked ${formatDateTime(lastScan.at)}`
                        : ' has not checked yet'}
                  </small>
                </span>
              </p>
              <div className="header-actions">
                <Link
                  href="/settings#s-you"
                  className="inbox-chip"
                  title={`Connected for ${purposeLabel(profile.purpose).toLowerCase()}. Reading the seeded demo inbox for this address; live Gmail is the next connection.`}
                >
                  <span className="inbox-dot" aria-hidden="true" />
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <rect
                      x="1.5"
                      y="3.5"
                      width="13"
                      height="9"
                      rx="1.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                    <path d="m2 5 6 4 6-4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  </svg>
                  <span className="inbox-address">{profile.inbox}</span>
                  <small>{purposeLabel(profile.purpose)}</small>
                </Link>
                <CommandBar configured={scanConfigured} paused={runtimeMode !== 'open'} />
                <NotificationBell
                  notices={feed.notices}
                  unread={feed.unread}
                  latestAt={feed.latestAt}
                />
                <AppearanceMenu accent={accent} density={density} home={home} />
                <ThemeToggle initialTheme={theme} />
              </div>
            </header>
            <main id="main-content" className="main-content">
              {/* First visit on any route: the product introduces itself before showing anything (#150). */}
              {named ? children : <Welcome />}
            </main>
            <footer className="site-foot">
              <p>
                <Link href="/about" className="foot-link">
                  About
                </Link>
                <Link href="/settings" className="foot-link">
                  Settings
                </Link>
                <Link href="/?tour=1" className="foot-link">
                  Replay the tour
                </Link>
                <a href="https://github.com/Omggdavidd/AWS-Hackathon-2026" className="foot-link">
                  Source
                </a>
              </p>
              <p>Open Loops, built for the AWS Agents for Humans hackathon, 2026.</p>
            </footer>
          </div>
        </div>
        <AppTabs pending={decisions.length} todayHref={todayHref} />
      </body>
    </html>
  )
}
