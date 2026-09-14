import { cookies } from 'next/headers'
import Link from 'next/link'
import { CalendarAgenda } from '@/components/calendar-agenda'
import { CalendarNext } from '@/components/calendar-next'
import { CalendarView } from '@/components/calendar-view'
import { Headline } from '@/components/headline'
import { groupByStatus } from '@/lib/format'
import { getStore, USER_ID } from '@/lib/ledger'
import { readProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

/** Deadlines on a six-week grid, with the day bar above and the next deadlines beside the month. */
export default async function CalendarPage({ searchParams }: PageProps<'/calendar'>) {
  const { day: rawDay } = await searchParams
  const selected =
    typeof rawDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDay) ? rawDay : undefined
  const profile = readProfile(await cookies())
  const store = await getStore()
  const loops = await store.listLoops(USER_ID)
  const now = new Date()
  return (
    <div className="today calendar-page" data-open={selected ? '' : undefined}>
      <section className="today-main" aria-label="Calendar">
        <Headline groups={groupByStatus(loops)} name={profile.name} now={now} />
        <CalendarNext loops={loops} now={now} />
        <CalendarView loops={loops} now={now} selected={selected} />
      </section>
      {selected && (
        <aside className="pane" aria-label="Agenda">
          <div className="pane-inner">
            <div className="pane-bar">
              <Link href="/calendar" className="pane-close" scroll={false}>
                ← Back to the month
              </Link>
            </div>
            <CalendarAgenda day={selected} loops={loops} now={now} />
          </div>
        </aside>
      )}
    </div>
  )
}
