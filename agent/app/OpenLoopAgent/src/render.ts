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
function text(value: string): string {
  return value.replace(/<(\/?)(message|event)\b/gi, '&lt;$1$2')
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

/**
 * Search results are leads, not evidence. Keep them to one JSON line without a body; a specialist
 * can call get_thread for the full text when the hit is relevant. JSON.stringify also keeps
 * attacker-authored newlines and quotes inside the value instead of inventing prompt structure.
 */
export function renderMessageSummary(m: EmailMessage): string {
  const snippet = m.snippet.length > 160 ? `${m.snippet.slice(0, 160)}…` : m.snippet
  return JSON.stringify({
    id: m.id,
    threadId: m.threadId,
    date: m.date,
    from: m.from,
    subject: m.subject,
    snippet,
  })
}

export function renderThread(messages: EmailMessage[]): string {
  return messages.map(renderMessage).join('\n\n')
}

export function renderEvent(e: CalendarEvent): string {
  const where = e.location ? ` location="${attr(e.location)}"` : ''
  return `<event id="${attr(e.id)}" start="${attr(e.start)}" end="${attr(e.end)}" status="${attr(e.status)}"${where}>${text(e.title)}</event>`
}
