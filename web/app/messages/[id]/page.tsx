import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FieldList } from '@/components/field-list'
import { formatDateTime } from '@/lib/format'
import { getSource } from '@/lib/inbox'
import { backHref, SOURCE_LABEL } from '@/lib/source'

/**
 * The source behind an evidence link (SPEC §8B "Show source", §12). Every claim on a loop page
 * cites a message or event id; this is where that id becomes something a person can read and
 * check for themselves.
 */
export default async function MessagePage({ params, searchParams }: PageProps<'/messages/[id]'>) {
  const { id } = await params
  const { loop } = await searchParams
  const source = getSource(id)
  if (!source) notFound()
  const back = backHref(loop)

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
          {SOURCE_LABEL[source.kind]} <span className="font-mono">{id}</span>
        </p>
      </div>

      {source.kind === 'email' ? (
        <>
          <FieldList
            rows={[
              ['From', source.message.from],
              ['To', source.message.to.join(', ')],
              ['Date', formatDateTime(source.message.date)],
            ]}
          />
          <Body>{source.message.body}</Body>
        </>
      ) : (
        <>
          <FieldList
            rows={[
              ['Starts', formatDateTime(source.event.start)],
              ['Ends', formatDateTime(source.event.end)],
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

function Body({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-sm leading-relaxed whitespace-pre-wrap">
      {children}
    </div>
  )
}
