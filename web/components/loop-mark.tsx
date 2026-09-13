/**
 * The brand mark: one ring that stops short of closing, and a dot in the gap. The ring is the
 * responsibility; the dot is the move that closes it. Shared by the wordmark and the hero ring.
 */
export function LoopMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="loop-mark">
      <path
        d="M27 12.64A11.5 11.5 0 1 1 19.36 5"
        stroke="currentColor"
        strokeWidth="3.8"
        strokeLinecap="round"
      />
      <circle cx="23.78" cy="8.22" r="2.45" className="loop-mark-dot" />
    </svg>
  )
}

/** Compact progress shares the open-ring geometry without competing with the greeting. */
export function LoopRing({ closed, total }: { closed: number; total: number }) {
  const share = total === 0 ? 0 : Math.round((closed / total) * 100)
  const caption = total === 0 ? 'No loops yet' : `${closed} of ${total} loops closed`
  return (
    <figure className="loop-ring" aria-label={caption}>
      <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
        <path
          d="M68.69 31.23A30 30 0 1 1 48.77 11.31"
          className="ring-track"
          strokeWidth="6"
          strokeLinecap="round"
        />
        {share > 0 && (
          <path
            d="M68.69 31.23A30 30 0 1 1 48.77 11.31"
            className="ring-progress"
            pathLength={100}
            strokeWidth="6"
            strokeLinecap="round"
            style={{ '--ring': share } as React.CSSProperties}
          />
        )}
        <circle cx="61.21" cy="18.79" r="3.8" className="ring-dot" />
      </svg>
      <figcaption>
        <strong>
          {closed}
          <span> / {total}</span>
        </strong>
        <span>loops closed</span>
      </figcaption>
    </figure>
  )
}

export function StateIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    'needs-you': 'M12 7v6 M12 17h.01',
    waiting: 'M12 6v6l4 2',
    watching: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
    resolved: 'm7 12 3 3 7-7',
    uncertain: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01',
    activity: 'M3 12h4l3-8 4 16 3-8h4',
    list: 'M4 7h16 M4 12h16 M4 17h16',
    calendar: 'M4 5h16v15H4z M4 10h16 M8 3v4 M16 3v4',
    decisions: 'M3 13V5h18v8 M3 13h5l2 3h4l2-3h5v6H3z',
    digest:
      'M4 6h16 M4 12h11 M4 18h7 M18 15l1.2 2.4L21.6 18l-2.4 1.2L18 21.6l-1.2-2.4L14.4 18l2.4-1.2z',
    mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
    refresh: 'M21 12a9 9 0 1 1-2.6-6.4 M21 4v5h-5',
    about: 'M12 11v5 M12 8h.01',
  }
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {['needs-you', 'waiting', 'resolved', 'uncertain', 'about'].includes(name) && (
        <circle cx="12" cy="12" r="9" />
      )}
      <path d={paths[name] ?? paths.overview} />
    </svg>
  )
}

const AREA_PATH: Record<string, string> = {
  school: 'M2 9l10-5 10 5-10 5z M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5 M22 9v6',
  work: 'M4 8h16v12H4z M9 8V5h6v3 M4 13h16',
  money: 'M12 3v18 M16 7H10a2.5 2.5 0 0 0 0 5h4a2.5 2.5 0 0 1 0 5H8',
  health: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  home: 'M3 11l9-8 9 8 M5 10v10h14V10 M10 20v-6h4v6',
  travel: 'M3 13l7-1 4-8h2l-2 8 6 1v2l-6 1-1 5h-2l-1-5-7-1z',
  community:
    'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M2 20a6 6 0 0 1 12 0 M14 20a4.5 4.5 0 0 1 8 0',
  other: 'M12 12h.01 M7 12h.01 M17 12h.01',
}

/** The area of life a loop belongs to, as a glyph a row can carry without a word. */
export function AreaIcon({ area }: { area: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={AREA_PATH[area] ?? AREA_PATH.other} />
    </svg>
  )
}
