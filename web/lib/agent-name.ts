export const AGENT_COOKIE = 'openloops-agent'
export const TOUR_COOKIE = 'openloops-toured'
export const NAME_MAX = 24

/** A name a person typed, trimmed and bounded; undefined when it is empty or missing. */
export function cleanAgentName(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const name = raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return name.length > 0 ? name : undefined
}
