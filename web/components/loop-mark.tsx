/**
 * The brand mark: one ring that stops short of closing, and a dot in the gap. The ring is the
 * responsibility; the dot is the move that closes it. Shared by the wordmark and the hero ring.
 */
export function LoopMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className="loop-mark">
      <path
        d="M26.83 14.09A11 11 0 1 1 17.91 5.17"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="23.78" cy="8.22" r="2.1" className="loop-mark-dot" />
    </svg>
  )
}

/**
 * The hero: the same open ring, drawn to the share of loops that have closed. When every loop is
 * resolved the ring meets the dot. Pure SVG, animated once on load with CSS, still under
 * prefers-reduced-motion.
 */
export function LoopRing({ closed, total }: { closed: number; total: number }) {
  const share = total === 0 ? 0 : Math.round((closed / total) * 100)
  const caption =
    total === 0 ? 'No loops yet' : closed === total ? 'All closed' : `${closed} of ${total} closed`
  return (
    <figure className="loop-ring" aria-label={caption}>
      <svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <path
          d="M182.72 85.42A84 84 0 1 1 114.59 17.28"
          className="ring-track"
          strokeWidth="11"
          strokeLinecap="round"
        />
        {share > 0 && (
          <path
            d="M182.72 85.42A84 84 0 1 1 114.59 17.28"
            className="ring-progress"
            pathLength={100}
            strokeWidth="11"
            strokeLinecap="round"
            style={{ '--ring': share } as React.CSSProperties}
          />
        )}
        <circle cx="159.4" cy="40.6" r="7.5" className="ring-dot" />
      </svg>
      <figcaption>{caption}</figcaption>
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
      {['needs-you', 'waiting', 'resolved', 'uncertain'].includes(name) && (
        <circle cx="12" cy="12" r="9" />
      )}
      <path d={paths[name] ?? paths.overview} />
    </svg>
  )
}
