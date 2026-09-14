import type { CalendarEvent, EmailMessage } from '@openloop/shared'

const BODY_LIMIT = 1500

/**
 * This is where mail becomes prompt text, so nothing here may invent an envelope (#164). A message
 * is written by whoever sent it; once `GoogleSource` is reading a live inbox that is a stranger.
 */

/** Inside double quotes, so a quote or an angle bracket would end the attribute or the tag. */
function attr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Text between the tags. Escaping every angle bracket would rewrite each prompt for no gain — a real
 * From header carries them ("Bursar's Office <bursar@northgate.edu>") — so only the envelope tokens
 * themselves are defused. Everything else reaches the model exactly as it was written.
 */
export function defuse(value: string): string {
  return value.replace(/<(\/?)(message|event)\b/gi, '&lt;$1$2')
}

const text = defuse

/**
 * Ledger records interpolated into a prompt. `JSON.stringify` escapes quotes and backslashes but not
 * angle brackets, so a stored excerpt reaches the model exactly as written unless it is defused
 * here. An excerpt is Investigator-authored *from* attacker mail, so a message saying "quote this
 * line exactly" can otherwise launder a forged envelope into the ledger and back into every later
 * prompt for that loop (#174). Applied to the serialised text rather than field by field, so a
 * field added later is covered without anyone remembering to.
 */
export function renderJson(value: unknown): string {
  return defuse(JSON.stringify(value, null, 2))
}

/** Compact, id-bearing text for prompts. Ids let the model cite sources instead of quoting. */
export function renderMessage(m: EmailMessage): string {
  const body = m.body.length > BODY_LIMIT ? `${m.body.slice(0, BODY_LIMIT)}…` : m.body
  return [
    `<message id="${attr(m.id)}" thread="${attr(m.threadId)}" date="${attr(m.date)}" labels="${attr(m.labels.join(','))}">`,
    `From: ${text(m.from)}`,
    `To: ${text(m.to.join(', '))}`,
    `Subject: ${text(m.subject)}`,
    '',
    text(body),
    '</message>',
  ].join('\n')
}

export function renderThread(messages: EmailMessage[]): string {
  return messages.map(renderMessage).join('\n\n')
}

export function renderEvent(e: CalendarEvent): string {
  const where = e.location ? ` location="${attr(e.location)}"` : ''
  return `<event id="${attr(e.id)}" start="${attr(e.start)}" end="${attr(e.end)}" status="${attr(e.status)}"${where}>${text(e.title)}</event>`
}
