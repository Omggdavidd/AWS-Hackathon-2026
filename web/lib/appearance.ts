export const ACCENT_COOKIE = 'openloops-accent'
export const DENSITY_COOKIE = 'openloops-density'
export const HOME_COOKIE = 'openloops-home'

export const DEFAULT_ACCENT = '#177e89'

/** Five accents that sit well on both grounds; the first is the product's own and means "no cookie". */
export const ACCENT_PRESETS: { id: string; name: string; hex: string }[] = [
  { id: 'teal', name: 'Teal', hex: DEFAULT_ACCENT },
  { id: 'plum', name: 'Plum', hex: '#7a4fb5' },
  { id: 'rose', name: 'Rose', hex: '#c2467a' },
  { id: 'amber', name: 'Amber', hex: '#b8721a' },
  { id: 'slate', name: 'Slate', hex: '#4b6a8a' },
]

export type Density = 'comfortable' | 'compact'
export type Home = 'today' | 'board' | 'calendar'

const HEX = /^#[0-9a-f]{6}$/i

/** A stored accent, or undefined for the default and for anything that is not a six-digit hex colour. */
export function parseAccent(raw: string | undefined): string | undefined {
  if (!raw || !HEX.test(raw)) return undefined
  const hex = raw.toLowerCase()
  return hex === DEFAULT_ACCENT ? undefined : hex
}

export function parseDensity(raw: string | undefined): Density {
  return raw === 'compact' ? 'compact' : 'comfortable'
}

export function parseHome(raw: string | undefined): Home {
  return raw === 'board' || raw === 'calendar' ? raw : 'today'
}

export const HOME_HREF: Record<Home, string> = {
  today: '/',
  board: '/board',
  calendar: '/calendar',
}
