import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSource, PERSONA } from '@/lib/inbox'

/**
 * The source behind an evidence link (SPEC §8B "Show source", §12). Every claim on a loop page
 * points at a message or event id; this is where that id becomes something a person can read and
 * check for themselves.
 */
export default async function MessagePage({ params, searchParams }: PageProps<'/messages/[id]'>) {
  const { id } = await params
  const { loop } = await searchParams
  const source = getSource(id)
  if (!source) notFound()

  const back =
    typeof loop === 'string' && loop.length > 0
      ? { href: `/loops/${loop}`, label: '← Back to loop' }
      : { href: '/', label: '← Home' }

  return (
    <article className="space-y-6">
      <div>
        <Link href={back.href} className="text-sm text-muted hover:text-foreground">
          {back.label}
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          {source.kind === 'email' ? source.message.subject : source.event.title}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {source.kind === 'email' ? 'Email' : 'Calendar event'}{' '}
          <span className="font-mono">{id}</span>
        </p>
      </div>

      {source.kind === 'email' ? (
        <>
          <Fields
            rows={[
              ['From', source.message.from],
              ['To', source.message.to.join(', ') || PERSONA.email],
              ['Date', new Date(source.message.date).toLocaleString('en-US')],
            ]}
          />
          <Body>{source.message.body}</Body>
        </>
      ) : (
        <>
          <Fields
            rows={[
              ['Starts', new Date(source.event.start).toLocaleString('en-US')],
              ['Ends', new Date(source.event.end).toLocaleString('en-US')],
              ['Where', source.event.location],
              ['With', source.event.attendees.join(', ')],
              ['Status', source.event.status],
            ]}
          />
          {source.event.description && <Body>{source.event.description}</Body>}
        </>
      )}
    </article>
  )
}

/** Skips a row with nothing in it rather than printing an empty label. */
function Fields({ rows }: { rows: [string, string | undefined][] }) {
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]))
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {present.map(([label, value]) => (
        <div key={label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function Body({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
      {children}
    </div>
  )
}
