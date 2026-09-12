import type { SourceType } from '@openloop/shared'

/**
 * Which sources have a page behind them, and how each is named. Pure on purpose: the loop page
 * needs these decisions without pulling the demo inbox into its bundle.
 */

/** How a source ref reads to a person. */
export const SOURCE_LABEL: Record<SourceType, string> = {
  email: 'Email',
  calendar: 'Calendar event',
  user: 'You',
  agent: 'The agent',
}

/**
 * True when `/messages/[id]` can show the thing itself. Evidence the agent or the user wrote has
 * no message behind it — its id is `action:<uuid>`, not `msg-004` — so it must not be a link.
 */
export function hasSourcePage(sourceType: SourceType): boolean {
  return sourceType === 'email' || sourceType === 'calendar'
}

/** Link to a source, carrying the loop so the page can offer a way back to it. */
export function messageHref(sourceId: string, loopId: string): string {
  return `/messages/${encodeURIComponent(sourceId)}?loop=${encodeURIComponent(loopId)}`
}

/** Where the source page's back link goes: the loop that sent you, or home. */
export function backHref(loop: string | string[] | undefined): { href: string; label: string } {
  const id = typeof loop === 'string' ? loop : undefined
  return id
    ? { href: `/loops/${encodeURIComponent(id)}`, label: '← Back to loop' }
    : { href: '/', label: '← Home' }
}
