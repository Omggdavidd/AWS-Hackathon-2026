import type { Effect } from '@/lib/effects'
import { formatDateTime } from '@/lib/format'

/** What the agent actually produced, rendered as the artifact it is: an email, an event, a reminder. */
export function ActionEffect({ effect }: { effect: Effect }) {
  switch (effect.kind) {
    case 'draft_email':
    case 'send_email':
      return (
        <div className="effect">
          <p className="effect-kind">
            {effect.kind === 'draft_email' ? 'Draft ready to send' : 'Sent'}
          </p>
          <dl className="effect-fields">
            <dt>To</dt>
            <dd>{effect.to}</dd>
            <dt>Subject</dt>
            <dd>{effect.subject}</dd>
          </dl>
          <p className="effect-body">{effect.body}</p>
        </div>
      )
    case 'calendar_event':
      return (
        <div className="effect">
          <p className="effect-kind">
            {effect.eventId ? 'Calendar event updated' : 'Calendar event created'}
          </p>
          <p className="effect-title">{effect.title}</p>
          <p className="effect-detail">
            {formatDateTime(effect.start)} to {formatDateTime(effect.end)}
            {effect.location ? `, ${effect.location}` : ''}
          </p>
        </div>
      )
    case 'reminder':
      return (
        <div className="effect">
          <p className="effect-kind">Reminder set</p>
          <p className="effect-title">{formatDateTime(effect.at)}</p>
          <p className="effect-detail">{effect.note}</p>
        </div>
      )
    case 'archive_thread':
      return <p className="action-reason">Archived the thread.</p>
    case 'note':
      return <p className="effect-body action-note">{effect.text}</p>
    default:
      return null
  }
}
