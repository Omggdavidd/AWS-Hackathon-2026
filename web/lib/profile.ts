import { cleanAgentName } from './agent-name'

/** Who the app is working for: the name they go by, the inbox it reads, and what that inbox is for. */
export const YOU_COOKIE = 'openloops-you'
export const INBOX_COOKIE = 'openloops-inbox'
export const PURPOSE_COOKIE = 'openloops-purpose'

/** The demo persona; every fixture in `demo/` is addressed to this inbox. */
export const DEMO_NAME = 'Alex'
export const DEMO_INBOX = 'alex.rivera@student.northgate.edu'
export const EMAIL_MAX = 254

export const PURPOSES = [
  { id: 'work', label: 'Work', hint: 'Colleagues, clients, invoices' },
  { id: 'school', label: 'School', hint: 'Courses, forms, the registrar' },
  { id: 'personal', label: 'Personal', hint: 'Bills, appointments, family' },
  { id: 'hobby', label: 'Hobby and newsletters', hint: 'Clubs, subscriptions, the inbox you skim' },
] as const

export type Purpose = (typeof PURPOSES)[number]['id']

export interface Profile {
  name: string
  inbox: string
  purpose: Purpose
}

export function parsePurpose(raw: string | undefined): Purpose | undefined {
  return PURPOSES.find((p) => p.id === raw)?.id
}

export function purposeLabel(purpose: Purpose): string {
  return PURPOSES.find((p) => p.id === purpose)?.label ?? purpose
}

/** A person's name, same rules as the agent's: trimmed, bounded, undefined when empty. */
export const cleanPersonName = cleanAgentName

/** An address a person typed: lowercased and trimmed; undefined unless it looks like one. */
export function cleanEmail(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const email = raw.trim().toLowerCase().slice(0, EMAIL_MAX)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined
}

/** The profile from the cookie jar, falling back to the demo persona field by field. */
export function readProfile(jar: { get(name: string): { value: string } | undefined }): Profile {
  return {
    name: cleanPersonName(jar.get(YOU_COOKIE)?.value) ?? DEMO_NAME,
    inbox: cleanEmail(jar.get(INBOX_COOKIE)?.value) ?? DEMO_INBOX,
    purpose: parsePurpose(jar.get(PURPOSE_COOKIE)?.value) ?? 'school',
  }
}
