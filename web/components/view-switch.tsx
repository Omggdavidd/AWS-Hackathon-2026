import Link from 'next/link'
import { StateIcon } from './loop-mark'

export type View = 'list' | 'board' | 'calendar'

const VIEWS: { id: View; label: string; caption: string; href: string; icon: string }[] = [
  { id: 'list', label: 'List', caption: 'By when it is due', href: '/', icon: 'list' },
  {
    id: 'board',
    label: 'Board',
    caption: 'Arrange by state, category or area',
    href: '/?view=board',
    icon: 'overview',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    caption: 'Deadlines on the month',
    href: '/?view=calendar',
    icon: 'calendar',
  },
]

export function parseView(raw: string | string[] | undefined): View {
  return raw === 'board' || raw === 'calendar' ? raw : 'list'
}

/** Three views on the same loops. List is home; the others are one click away and back. */
export function ViewSwitch({ current }: { current: View }) {
  return (
    <nav className="view-switch" aria-label="View">
      {VIEWS.map((view) => (
        <Link
          key={view.id}
          href={view.href}
          aria-current={view.id === current ? 'page' : undefined}
        >
          <StateIcon name={view.icon} />
          <span>
            <strong>{view.label}</strong>
            <small>{view.caption}</small>
          </span>
        </Link>
      ))}
    </nav>
  )
}
