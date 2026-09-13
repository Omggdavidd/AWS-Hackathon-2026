import { StateIcon } from '@/components/loop-mark'

const TEAM = [
  { login: 'Omggdavidd', role: 'Lead, front end, deployment' },
  { login: 'Ojulari123', role: 'Agent quality and demo reset' },
  { login: 'tdare514', role: 'Observability, notifications, CI' },
  { login: 'ab00bae', role: 'README, loop actions, demo script' },
  { login: 'AyomideAw', role: 'Demo and submission checks' },
]

const STATES = [
  { id: 'needs-you', name: 'Needs you', text: 'Your move: a decision, a payment, a signature.' },
  {
    id: 'waiting',
    name: 'Waiting',
    text: 'Someone else owes the next step; the agent follows up.',
  },
  {
    id: 'watching',
    name: 'Watching',
    text: 'Nothing to do yet. The agent watches for the change.',
  },
  { id: 'resolved', name: 'Resolved', text: 'Closed by evidence in your mail, or by you.' },
]

/** What Open Loops is, in the order a new person asks: what it does, how it thinks, who made it. */
export default function AboutPage() {
  return (
    <div className="page-column about">
      <header className="page-head">
        <h1>Open Loops</h1>
        <p>
          A follow-through agent. It reads your inbox and calendar, keeps a ledger of every
          responsibility that is still open, handles the low-risk ones itself, and interrupts you
          only when a real decision is needed.
        </p>
      </header>
      <section className="about-section" aria-labelledby="about-states">
        <h2 id="about-states">Every loop is in one of four states</h2>
        <ul className="about-states">
          {STATES.map((state) => (
            <li key={state.id} data-state={state.id}>
              <StateIcon name={state.id} />
              <div>
                <strong>{state.name}</strong>
                <p>{state.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="about-section" aria-labelledby="about-how">
        <h2 id="about-how">How it decides</h2>
        <p>
          Specialist agents built with the Strands SDK run on Amazon Bedrock and AgentCore. One
          extracts the responsibility from a thread, one investigates the rest of your mail and the
          ledger for evidence, one judges the risk and the consequence of ignoring it. Every claim
          keeps its link to the message it came from, and no email is sent or payment made without
          your approval.
        </p>
      </section>
      <section className="about-section" aria-labelledby="about-team">
        <h2 id="about-team">Built for the AWS Agents for Humans hackathon</h2>
        <ul className="about-team">
          {TEAM.map((member) => (
            <li key={member.login}>
              <a href={`https://github.com/${member.login}`} className="about-link">
                {member.login}
              </a>
              <span className="about-role">{member.role}</span>
            </li>
          ))}
        </ul>
        <p>
          Source, architecture and decisions:{' '}
          <a href="https://github.com/Omggdavidd/AWS-Hackathon-2026" className="about-link">
            github.com/Omggdavidd/AWS-Hackathon-2026
          </a>
        </p>
      </section>
    </div>
  )
}
