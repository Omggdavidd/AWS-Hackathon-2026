import type { Metadata } from 'next'
import { Geist_Mono, Instrument_Sans } from 'next/font/google'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { BottomTabs, WorkspaceNav } from '@/components/bottom-tabs'
import { LoopMark } from '@/components/loop-mark'
import { ThemeToggle } from '@/components/theme-toggle'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'
import './globals.css'

const sans = Instrument_Sans({ variable: '--font-instrument', subsets: ['latin'] })
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Open Loops',
  description: 'A follow-through agent that closes the open loops in your life.',
}

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const theme = (await cookies()).get('openloops-theme')?.value === 'dark' ? 'dark' : 'light'
  const store = await getStore()
  const loops = await store.listLoops(USER_ID)
  const counts = {
    needsYou: loops.filter((l) => l.status === 'NEEDS_YOU').length,
    waiting: loops.filter((l) => l.status === 'WAITING').length,
    watching: loops.filter((l) => l.status === 'WATCHING').length,
    resolved: loops.filter((l) => l.status === 'RESOLVED').length,
    uncertain: loops.filter((l) => l.status === 'UNCERTAIN').length,
  }
  const wordmark = (
    <Link href="/" className="wordmark">
      <LoopMark />
      <span>Open Loops</span>
    </Link>
  )
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
          <aside className="sidebar">
            {wordmark}
            <WorkspaceNav counts={counts} />
            <div className="profile">
              <span className="avatar">{USER_NAME[0]}</span>
              <div>
                <p>{USER_NAME}</p>
                <span>Personal workspace</span>
              </div>
            </div>
          </aside>
          <div className="workspace-content">
            <header className="workspace-header">
              <div className="mobile-wordmark">{wordmark}</div>
              <span className="workspace-label">Personal workspace</span>
              <ThemeToggle initialTheme={theme} />
            </header>
            <main id="main-content" className="main-content">
              {children}
            </main>
          </div>
        </div>
        <BottomTabs counts={counts} />
      </body>
    </html>
  )
}
