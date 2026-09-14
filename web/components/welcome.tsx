import { LoopMark, StateIcon } from '@/components/loop-mark'
import { WelcomeSteps } from '@/components/welcome-steps'

const STATES = [
  { id: 'needs-you', text: 'Needs you' },
  { id: 'waiting', text: 'Waiting on someone' },
  { id: 'watching', text: 'Watching' },
  { id: 'resolved', text: 'Resolved' },
]

/**
 * The first screen a new person sees: what this is in three sentences, then four questions one at
 * a time (#150, #176): their name, what to call the agent, what the inbox is for and which inbox.
 * The agent's name replaces "Your agent" everywhere; the inbox shows in the top bar as connected.
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
        <WelcomeSteps />
      </div>
    </div>
  )
}
