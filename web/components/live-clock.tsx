'use client'

import { useEffect, useState } from 'react'

/**
 * The time of day in the demo's zone, ticking once a second. Rendered empty on the server and
 * filled after mount, so the server and client never disagree about the current second.
 */
export function LiveClock({ timeZone }: { timeZone: string }) {
  const [time, setTime] = useState<string>()
  useEffect(() => {
    const format = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      timeZone,
      timeZoneName: 'short',
    })
    const tick = () => setTime(format.format(new Date()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [timeZone])
  return (
    <time className="live-clock" data-ready={time !== undefined || undefined}>
      {time ?? '​'}
    </time>
  )
}
