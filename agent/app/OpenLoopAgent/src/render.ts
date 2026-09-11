import type { CalendarEvent, EmailMessage } from '@openloop/shared'

const BODY_LIMIT = 1500

/** Compact, id-bearing text for prompts. Ids let the model cite sources instead of quoting. */
export function renderMessage(m: EmailMessage): string {
  const body = m.body.length > BODY_LIMIT ? `${m.body.slice(0, BODY_LIMIT)}…` : m.body
  return [
    `<message id="${m.id}" thread="${m.threadId}" date="${m.date}" labels="${m.labels.join(',')}">`,
    `From: ${m.from}`,
    `To: ${m.to.join(', ')}`,
    `Subject: ${m.subject}`,
    '',
    body,
    '</message>',
  ].join('\n')
}

export function renderThread(messages: EmailMessage[]): string {
  return messages.map(renderMessage).join('\n\n')
}

export function renderEvent(e: CalendarEvent): string {
  const where = e.location ? ` location="${e.location}"` : ''
  return `<event id="${e.id}" start="${e.start}" end="${e.end}" status="${e.status}"${where}>${e.title}</event>`
}
