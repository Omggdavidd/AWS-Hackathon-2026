/**
 * Recaptures docs/screenshots/ from a local dev server. See docs/screenshots/README.md.
 *
 * Playwright is deliberately NOT a repository dependency: it would add a browser download to every
 * teammate's install and to CI, for a script that runs by hand a few times a release.
 */

import { createRequire } from 'node:module'
import path from 'node:path'

// Playwright is resolved at run time rather than statically imported, so it can live outside the
// repository. PLAYWRIGHT_MODULE is an absolute path to an installed copy; without it this falls
// back to normal resolution, which works if someone has installed it here after all.
const require = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright'))
} catch {
  console.error(
    'Playwright not found. Install it outside the repo and point at it:\n' +
      '  PW=$(mktemp -d) && npm i --prefix "$PW" playwright\n' +
      '  PLAYWRIGHT_MODULE="$PW/node_modules/playwright" node scripts/screenshots.mjs\n' +
      'See docs/screenshots/README.md.',
  )
  process.exit(1)
}

const BASE = process.env.BASE_URL ?? 'http://localhost:3000'
const OUT = process.env.OUT_DIR ?? path.resolve('docs/screenshots')
/** Comma-separated shot names; empty means all. Handy for re-shooting one screen after a change. */
const ONLY = new Set((process.env.ONLY ?? '').split(',').filter(Boolean))

const DESKTOP = { width: 1440, height: 900 }
const MOBILE = { width: 390, height: 844 }

/** Cookies that put the app in the state a returning person sees. */
const settled = (theme = 'light') => [
  { name: 'openloops-theme', value: theme, url: BASE },
  { name: 'openloops-toured', value: '1', url: BASE },
  // No invented branding: this is the same string the app shows when nobody has named the agent
  // (layout.tsx falls back to 'Your agent'), and what STATUS.md records the deployed app as showing.
  { name: 'openloops-agent', value: 'Your agent', url: BASE },
]

const shots = [
  // The first screen a new person sees: no agent cookie, so Welcome renders instead of Today.
  {
    file: 'welcome',
    url: '/',
    viewport: DESKTOP,
    cookies: [{ name: 'openloops-theme', value: 'light', url: BASE }],
  },

  { file: 'dashboard-desktop', url: '/', viewport: DESKTOP },
  { file: 'dashboard-desktop-dark', url: '/', viewport: DESKTOP, theme: 'dark' },
  { file: 'dashboard-mobile', url: '/', viewport: MOBILE },
  { file: 'dashboard-mobile-dark', url: '/', viewport: MOBILE, theme: 'dark' },

  { file: 'dashboard-board', url: '/board', viewport: DESKTOP },
  { file: 'dashboard-board-area', url: '/board', viewport: DESKTOP, boardBy: 'area' },
  { file: 'dashboard-board-category', url: '/board', viewport: DESKTOP, boardBy: 'category' },
  { file: 'dashboard-calendar', url: '/calendar', viewport: DESKTOP },

  // The sheet opens from a query param, so it needs no click. act-deposit-pay is the high-risk
  // action, which is the one worth showing: it cannot execute without a person.
  { file: 'decision-sheet', url: '/decisions?action=act-deposit-pay', viewport: DESKTOP },
  { file: 'settings', url: '/settings', viewport: DESKTOP },

  { file: 'loop-insurance-draft', url: '/loops/loop-insurance', viewport: DESKTOP },
]

// PLAYWRIGHT_CHROMIUM_PATH lets a machine whose browser build differs from the npm package's
// expectation reuse the chromium it already has, instead of downloading a second copy.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH
const browser = await chromium.launch(executablePath ? { executablePath } : {})
let written = 0

for (const shot of shots) {
  if (ONLY.size > 0 && !ONLY.has(shot.file)) continue
  const base = shot.base ?? BASE
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: 1,
    colorScheme: shot.theme === 'dark' ? 'dark' : 'light',
    reducedMotion: 'reduce', // no half-played transitions
  })
  const cookies = (shot.cookies ?? settled(shot.theme)).map((c) => ({ ...c, url: base }))
  await context.addCookies(cookies)
  if (shot.boardBy) {
    await context.addInitScript((by) => {
      localStorage.setItem('openloops:board:user-alex:v1:by', by)
    }, shot.boardBy)
  }
  const page = await context.newPage()
  const response = await page.goto(base + shot.url, { waitUntil: 'networkidle' })
  const status = response?.status() ?? 0
  if (status >= 400) {
    console.error(`  !! ${shot.file}: HTTP ${status} at ${shot.url}`)
    await context.close()
    continue
  }
  // The live clock and any entry animation settle within a beat.
  await page.waitForTimeout(600)
  const file = path.join(OUT, `${shot.file}.png`)
  await page.screenshot({ path: file, fullPage: Boolean(shot.fullPage) })
  console.log(`  ok ${shot.file}.png`)
  written++
  await context.close()
}

await browser.close()
console.log(`\n${written} written to ${OUT}`)
