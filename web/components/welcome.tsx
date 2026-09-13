import { nameAgent } from '@/app/actions'
import { LoopMark, StateIcon } from '@/components/loop-mark'
import { SubmitButton } from '@/components/submit-button'
import { NAME_MAX } from '@/lib/agent-name'

const STATES = [
  { id: 'needs-you', text: 'Needs you' },
  { id: 'waiting', text: 'Waiting on someone' },
  { id: 'watching', text: 'Watching' },
  { id: 'resolved', text: 'Resolved' },
]

/**
 * The first screen a new person sees: what this is in three sentences, then one thing to decide.
 * Naming the agent is the moment it becomes theirs; the name replaces "Your agent" everywhere.
 */
export function Welcome() {
  return (
    <div className="welcome">
      <div className="welcome-card">
        <p className="welcome-mark">
          <LoopMark />
          <span>Open Loops</span>
        </p>
        <h1>Everything you still owe, in one place.</h1>
        <p className="welcome-lede">
          Open Loops reads your inbox and calendar and keeps a ledger of what is still open: the
          form to sign, the deposit to pay, the reply you are waiting on. It handles the low-risk
          work itself and interrupts you only when a real decision is needed.
        </p>
        <ul className="welcome-states" aria-label="The four states">
          {STATES.map((s) => (
            <li key={s.id} data-state={s.id}>
              <StateIcon name={s.id} />
              {s.text}
            </li>
          ))}
        </ul>
        <form action={nameAgent} className="welcome-form">
          <label htmlFor="agent-name">Name your agent</label>
          <p className="welcome-hint">It signs the drafts it prepares for you.</p>
          <div className="welcome-row">
            <input
              id="agent-name"
              name="name"
              defaultValue="Loop"
              maxLength={NAME_MAX}
              autoComplete="off"
              required
            />
            <SubmitButton pendingLabel="Opening…">Start</SubmitButton>
          </div>
        </form>
      </div>
    </div>
  )
}
