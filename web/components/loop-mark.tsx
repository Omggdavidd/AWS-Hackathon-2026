/** Two open paths, shared by the wordmark and the sculpture's static fallback. */
export function LoopMark() {
  return (
    <svg viewBox="0 0 48 32" fill="none" aria-hidden="true" className="loop-mark">
      <path
        d="M27 8a11 11 0 1 0 0 16"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M21 24a11 11 0 1 0 0-16"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
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
