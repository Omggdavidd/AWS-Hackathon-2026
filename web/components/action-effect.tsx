import type { Effect } from '@/lib/effects'
import { formatDateTime } from '@/lib/format'

/** What the agent actually produced, rendered as the artifact it is: an email, an event, a reminder. */
export function ActionEffect({ effect }: { effect: Effect }) {
  switch (effect.kind) {
    case 'draft_email':
    case 'send_email':
      return (
        <div className="mt-2 rounded-md border border-border bg-background p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-muted">
            {effect.kind === 'draft_email' ? 'Draft ready to send' : 'Sent'}
          </p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted">
            <dt>To</dt>
            <dd className="text-foreground">{effect.to}</dd>
            <dt>Subject</dt>
            <dd className="text-foreground">{effect.subject}</dd>
          </dl>
          <p className="mt-2 whitespace-pre-line">{effect.body}</p>
        </div>
      )
    case 'calendar_event':
      return (
        <div className="mt-2 rounded-md border border-border bg-background p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-muted">
            {effect.eventId ? 'Calendar event updated' : 'Calendar event created'}
          </p>
          <p className="mt-1 font-medium">{effect.title}</p>
          <p className="text-muted">
            {formatDateTime(effect.start)} to {formatDateTime(effect.end)}
            {effect.location ? ` · ${effect.location}` : ''}
          </p>
        </div>
      )
    case 'reminder':
      return (
        <div className="mt-2 rounded-md border border-border bg-background p-3 text-sm">
          <p className="text-xs uppercase tracking-wider text-muted">Reminder set</p>
          <p className="mt-1">
            <span className="text-muted">{formatDateTime(effect.at)} · </span>
            {effect.note}
          </p>
        </div>
      )
    case 'archive_thread':
      return <p className="mt-1 text-sm text-muted">Archived the thread.</p>
    case 'note':
      return <p className="mt-1 whitespace-pre-line text-sm">{effect.text}</p>
    default:
      return null
  }
}
