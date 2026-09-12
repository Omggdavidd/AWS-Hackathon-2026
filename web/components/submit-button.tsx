'use client'

import { useFormStatus } from 'react-dom'

/** Submit button that reflects a pending server action (Approve waits on the runtime for ~20 seconds). */
export function SubmitButton({
  children,
  pendingLabel,
  subtle = false,
}: {
  children: React.ReactNode
  pendingLabel: string
  subtle?: boolean
}) {
  const { pending } = useFormStatus()
  const style = subtle
    ? 'border border-border bg-card hover:bg-background'
    : 'bg-foreground text-background hover:opacity-90'
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-progress disabled:opacity-60 ${style}`}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
