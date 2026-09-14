'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { resetDemo } from '@/app/actions'

const ARM_MS = 8000

/**
 * Put the demo back to its starting ledger. Confirms in place like Approve, because it deletes
 * every loop for the demo user; on the shared table the next Scan inbox rebuilds them.
 */
export function ResetDemo({ shared }: { shared: boolean }) {
  const [armed, setArmed] = useState(false)
  const [done, setDone] = useState<string>()
  const [busy, start] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!armed) return
    timer.current = setTimeout(() => setArmed(false), ARM_MS)
    return () => clearTimeout(timer.current)
  }, [armed])

  return (
    <div className="setting-row">
      <div>
        <p className="setting-name">Reset the demo</p>
        <p className="setting-hint">
          {shared
            ? 'Deletes every loop, action and note for the demo user from the shared table. Then run Scan inbox to rebuild them from the seeded mail, a minute and a half to two minutes.'
            : 'Puts the local ledger back to the seeded eleven loops.'}
        </p>
        {done && <p className="setting-done">{done}</p>}
      </div>
      <button
        type="button"
        className="setting-button"
        data-danger
        data-armed={armed || undefined}
        disabled={busy}
        onClick={() => {
          if (!armed) {
            setArmed(true)
            return
          }
          setArmed(false)
          start(async () => {
            const result = await resetDemo()
            setDone(result)
          })
        }}
      >
        {busy ? 'Resetting…' : armed ? 'Confirm reset' : 'Reset'}
      </button>
    </div>
  )
}
