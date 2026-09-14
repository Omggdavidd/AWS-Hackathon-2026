import Image from 'next/image'
import Link from 'next/link'
import { StateIcon } from '@/components/loop-mark'

const TEAM = [
  { name: 'David Amaefula', login: 'Omggdavidd', role: 'Lead, front end, deployment' },
  { name: 'Adeoluwa Ojulari', login: 'Ojulari123', role: 'Agent quality and demo reset' },
  { name: 'Oluwatoby Dare', login: 'tdare514', role: 'Observability, notifications, CI' },
  { name: 'Ebube Esor', login: 'ab00bae', role: 'README, loop actions, demo script' },
  { name: 'Ayomide Awofisayo', login: 'AyomideAw', role: 'Demo and submission checks' },
]

const STORIES = [
  {
    who: 'Students',
    state: 'needs-you',
    label: 'Needs you',
    text: 'A registration deposit due Friday. A form the department is waiting on. A housing fee. Each stays open until the receipt or the confirmation shows up in your mail, with the deadline on your calendar.',
  },
  {
    who: 'Applications and follow-ups',
    state: 'waiting',
    label: 'Waiting',
    text: 'You applied, they said thanks, and nothing since. The ledger knows who owes the next move, the agent drafts the follow-up for you to send, and the loop closes when the reply arrives.',
  },
  {
    who: 'A manager buried in mail',
    state: 'watching',
    label: 'Watching',
    text: 'A hundred messages a day, and the six that carry a real request are lost among them. The ledger holds only what is owed and to whom, with the evidence. Everything else stays quiet.',
  },
  {
    who: 'Time away',
    state: 'resolved',
    label: 'Resolved',
    text: 'A week of leave, or a week when you cannot face the inbox. The agent checks in on its own every morning and tells you what changed. Only a decision that is genuinely yours interrupts you.',
  },
]

const NEXT = [
  {
    title: 'Your real inbox',
    text: 'The Gmail and Google Calendar reader is built; the sign-in that hands it a token is next. Then the seeded demo becomes your mail.',
  },
  {
    title: 'Real effects, still gated',
    text: 'Drafts saved into Gmail and events on your actual calendar. Sending and paying keep waiting for your approval, enforced in code.',
  },
  {
    title: 'Follow-ups with a clock',
    text: 'No reply in two weeks becomes a nudge on its own, so an application or a request to a colleague never goes cold without you knowing.',
  },
  {
    title: 'Several inboxes, one ledger',
    text: 'School, work and personal mail in one place, grouped by the area of life they belong to.',
  },
  {
    title: 'Read it to me',
    text: 'A spoken morning digest and asking the agent a question out loud, for the moments when a screen is the wrong tool.',
  },
  {
    title: 'Where obligations also live',
    text: 'School portals, billing notices and shared team inboxes, so the ledger sees the responsibility wherever it arrives.',
  },
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
      <section className="about-section" aria-labelledby="about-who">
        <h2 id="about-who">Who it is for</h2>
        <p>
          Anyone whose obligations arrive as email and quietly expire there. Four lives, one ledger:
          each story is a state the agent already tracks.
        </p>
        <ul className="about-stories">
          {STORIES.map((story) => (
            <li key={story.who} data-state={story.state}>
              <span className="about-chip">
                <StateIcon name={story.state} />
                {story.label}
              </span>
              <strong>{story.who}</strong>
              <p>{story.text}</p>
            </li>
          ))}
        </ul>
      </section>
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
        <figure className="about-diagram">
          <Image
            className="about-diagram-img"
            src="/architecture.png"
            alt="Architecture: the Next.js app on Vercel and the Strands agents on AgentCore Runtime share one DynamoDB ledger; the agents read the inbox and calendar and call Claude on Bedrock."
            width={1600}
            height={900}
            sizes="(max-width: 1100px) 100vw, 900px"
          />
          <figcaption>
            The web app and the agents never talk to each other directly; both read and write the
            same ledger.
          </figcaption>
        </figure>
      </section>
      <section className="about-section" aria-labelledby="about-next">
        <h2 id="about-next">What is next</h2>
        <p>
          Everything above runs today on a seeded inbox, so a judge can click through it without
          connecting anything. In the order we would build it:
        </p>
        <ol className="about-next">
          {NEXT.map((item, i) => (
            <li key={item.title}>
              <span className="about-step" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="about-section" aria-labelledby="about-team">
        <h2 id="about-team">The Dev Team</h2>
        <ul className="about-team">
          {TEAM.map((member) => (
            <li key={member.login}>
              <a href={`https://github.com/${member.login}`} className="about-link">
                {member.name}
              </a>
              <span className="about-role">{member.role}</span>
            </li>
          ))}
        </ul>
        <p>
          New here?{' '}
          <Link href="/?tour=1" className="about-link">
            Replay the tour
          </Link>
          .
        </p>
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
