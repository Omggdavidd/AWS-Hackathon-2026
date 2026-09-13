'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { Segment } from '@/lib/changes'

/**
 * One quiet line of what changed since you last looked (SPEC §8H): state changes and decisions,
 * never a count of mail. The server decides whether to render it at all, so there is no flash of a
 * banner the user already dismissed.
 *
 * Dismissal stores the newest event's timestamp rather than a boolean, so the banner returns when
 * something newer happens instead of staying hidden forever.
 */
export function ChangeBanner({
  sentences,
  latestAt,
}: {
  sentences: Segment[][]
  latestAt: string
}) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <aside className="change-banner" aria-label="What changed">
      <p>
        {sentences.map((sentence) => (
          <span key={sentence[0]?.key}>
            {sentence.map((segment) =>
              segment.loopId ? (
                <Link key={segment.key} href={`/loops/${segment.loopId}`}>
                  {segment.text}
                </Link>
              ) : (
                <span key={segment.key}>{segment.text}</span>
              ),
            )}{' '}
          </span>
        ))}
      </p>
      <button
        type="button"
        onClick={() => {
          // biome-ignore lint/suspicious/noDocumentCookie: matches the theme preference, read by the server.
          document.cookie = `openloops-seen=${encodeURIComponent(latestAt)}; Path=/; Max-Age=31536000; SameSite=Lax`
          setDismissed(true)
        }}
        aria-label="Dismiss what changed"
      >
        Dismiss
      </button>
    </aside>
  )
}
