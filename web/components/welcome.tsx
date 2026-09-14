import { nameAgent } from '@/app/actions'
import { LoopMark, StateIcon } from '@/components/loop-mark'
import { SubmitButton } from '@/components/submit-button'
import { NAME_MAX } from '@/lib/agent-name'
import { DEMO_INBOX, DEMO_NAME, EMAIL_MAX, PURPOSES } from '@/lib/profile'

const STATES = [
  { id: 'needs-you', text: 'Needs you' },
  { id: 'waiting', text: 'Waiting on someone' },
  { id: 'watching', text: 'Watching' },
  { id: 'resolved', text: 'Resolved' },
]

/**
 * The first screen a new person sees: what this is in three sentences, then who it is for: their
 * name, what the inbox is for, which inbox, and what to call the agent (#150). The agent's name
 * replaces "Your agent" everywhere; the inbox shows in the top bar as the one connected.
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
          <div className="welcome-pair">
            <div className="welcome-field">
              <label htmlFor="you-name">What should we call you?</label>
              <div className="welcome-row">
                <input
                  id="you-name"
                  name="you"
                  defaultValue={DEMO_NAME}
                  maxLength={NAME_MAX}
                  autoComplete="given-name"
                  required
                />
              </div>
            </div>
            <div className="welcome-field">
              <label htmlFor="agent-name">Name your agent</label>
              <div className="welcome-row">
                <input
                  id="agent-name"
                  name="name"
                  defaultValue="Loop"
                  maxLength={NAME_MAX}
                  autoComplete="off"
                  required
                />
              </div>
            </div>
          </div>

          <fieldset className="welcome-field">
            <legend>What are you using Open Loops for?</legend>
            <div className="welcome-choices">
              {PURPOSES.map((p) => (
                <label key={p.id} className="welcome-choice">
                  <input
                    type="radio"
                    name="purpose"
                    value={p.id}
                    defaultChecked={p.id === 'school'}
                  />
                  <span className="welcome-choice-label">{p.label}</span>
                  <small className="welcome-choice-hint">{p.hint}</small>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="welcome-field">
            <label htmlFor="inbox">Which inbox should it read?</label>
            <p className="welcome-hint">
              Prefilled with the demo inbox. It shows in the top bar as the one connected; the agent
              signs the drafts it prepares with its name.
            </p>
            <div className="welcome-row">
              <input
                id="inbox"
                name="inbox"
                type="email"
                defaultValue={DEMO_INBOX}
                maxLength={EMAIL_MAX}
                autoComplete="email"
                required
              />
              <SubmitButton pendingLabel="Opening…">Start</SubmitButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
