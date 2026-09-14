import type { CalendarEvent, EmailMessage } from '@openloop/shared'

const BODY_LIMIT = 1500

/** The only tags this file opens. Anything that could pass for one is neutralised on the way in. */
const ENVELOPE_TAG = /<\s*\/?\s*(?:message|event)\b/gi

/**
 * Everything between the tags is written by whoever emailed the user. A body carrying `</message>`
 * would close its own envelope and let the next line forge one with an id of the sender's choosing,
 * which the Investigator would then cite as evidence for a claim nobody made. Only a run of
 * characters that could open or close an envelope is rewritten, so text without one renders byte for
 * byte as it did before and the prompts the demo was calibrated on do not move.
 */
function text(value: string): string {
  return value.replace(ENVELOPE_TAG, (tag) => `&lt;${tag.slice(1)}`)
}

/** Attribute values additionally cannot carry a quote, an angle bracket or a line break. */
function attr(value: string): string {
  return text(value)
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\s*[\r\n]+\s*/g, ' ')
}

/** Compact, id-bearing text for prompts. Ids let the model cite sources instead of quoting. */
export function renderMessage(m: EmailMessage): string {
  const raw = m.body.length > BODY_LIMIT ? `${m.body.slice(0, BODY_LIMIT)}…` : m.body
  const labels = m.labels.map(attr).join(',')
  return [
    `<message id="${attr(m.id)}" thread="${attr(m.threadId)}" date="${attr(m.date)}" labels="${labels}">`,
    `From: ${text(m.from)}`,
    `To: ${m.to.map(text).join(', ')}`,
    `Subject: ${text(m.subject)}`,
    '',
    text(raw),
    '</message>',
  ].join('\n')
}

export function renderThread(messages: EmailMessage[]): string {
  return messages.map(renderMessage).join('\n\n')
}

export function renderEvent(e: CalendarEvent): string {
  const where = e.location ? ` location="${attr(e.location)}"` : ''
  return `<event id="${attr(e.id)}" start="${attr(e.start)}" end="${attr(e.end)}" status="${e.status}"${where}>${text(e.title)}</event>`
}
