'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { approveAction, cancelAction } from '@/app/actions'

type Choice = 'approve' | 'decline'

/** How long a first click stays armed before the buttons return to rest. */
const ARM_MS = 8000

/**
 * Approve and Decline that confirm in place: the first click arms the button and renames it, the
 * second within eight seconds submits. Approve reaches the runtime and cannot be pulled back, so
 * the confirmation is on the click rather than an undo afterwards.
 */
export function DecisionButtons({ actionId }: { actionId: string }) {
  const [armed, setArmed] = useState<Choice>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!armed) return
    timer.current = setTimeout(() => setArmed(undefined), ARM_MS)
    return () => clearTimeout(timer.current)
  }, [armed])

  return (
    <div className="decision-buttons" data-armed={armed}>
      <form action={approveAction.bind(null, actionId)}>
        <Confirming
          choice="approve"
          armed={armed}
          onArm={setArmed}
          idle="Approve"
          confirm="Confirm approve"
          busy="Approving…"
        />
      </form>
      <form action={cancelAction.bind(null, actionId)}>
        <Confirming
          choice="decline"
          armed={armed}
          onArm={setArmed}
          idle="Decline"
          confirm="Confirm decline"
          busy="Declining…"
        />
      </form>
      <p className="decision-armed-note" aria-live="polite">
        {armed === 'approve' && 'Click again to approve. The agent will act on it.'}
        {armed === 'decline' && 'Click again to decline. The agent will not do this.'}
      </p>
    </div>
  )
}

function Confirming({
  choice,
  armed,
  onArm,
  idle,
  confirm,
  busy,
}: {
  choice: Choice
  armed: Choice | undefined
  onArm: (c: Choice | undefined) => void
  idle: string
  confirm: string
  busy: string
}) {
  const { pending } = useFormStatus()
  const isArmed = armed === choice
  return (
    <button
      type={isArmed ? 'submit' : 'button'}
      className="decision-button"
      data-choice={choice}
      data-armed={isArmed || undefined}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (isArmed) return
        event.preventDefault()
        onArm(choice)
      }}
    >
      {pending ? busy : isArmed ? confirm : idle}
    </button>
  )
}
