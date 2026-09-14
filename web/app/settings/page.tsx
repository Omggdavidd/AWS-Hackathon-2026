import { cookies } from 'next/headers'
import { renameAgent, updateProfile } from '@/app/actions'
import { AppearanceControls } from '@/components/appearance-menu'
import { NotificationSetting } from '@/components/notification-setting'
import { ResetDemo } from '@/components/reset-demo'
import { RuntimeLockControl } from '@/components/runtime-lock-control'
import { SubmitButton } from '@/components/submit-button'
import { AGENT_COOKIE, cleanAgentName, NAME_MAX } from '@/lib/agent-name'
import {
  ACCENT_COOKIE,
  DENSITY_COOKIE,
  HOME_COOKIE,
  parseAccent,
  parseDensity,
  parseHome,
} from '@/lib/appearance'
import { LEDGER_TABLE } from '@/lib/ledger'
import { EMAIL_MAX, PURPOSES, purposeLabel, readProfile } from '@/lib/profile'
import { readRuntimeMode } from '@/lib/runtime-lock'

export const dynamic = 'force-dynamic'

/** Everything a person can change about their Open Loops, on one page, in the order they will ask. */
export default async function SettingsPage() {
  const jar = await cookies()
  const agentName = cleanAgentName(jar.get(AGENT_COOKIE)?.value) ?? 'Loop'
  const accent = parseAccent(jar.get(ACCENT_COOKIE)?.value)
  const density = parseDensity(jar.get(DENSITY_COOKIE)?.value)
  const home = parseHome(jar.get(HOME_COOKIE)?.value)
  const profile = readProfile(jar)
  const runtimeMode = await readRuntimeMode()
  return (
    <div className="page-column settings">
      <header className="page-head">
        <h1>Settings</h1>
        <p>Your agent, how the app looks, what it may do, and where its mail comes from.</p>
      </header>

      <section className="setting-section" aria-labelledby="s-you">
        <h2 id="s-you">You</h2>
        <form action={updateProfile} className="setting-stack">
          <div className="setting-row">
            <div>
              <label htmlFor="settings-you" className="setting-name">
                Name
              </label>
              <p className="setting-hint">How the app greets you.</p>
            </div>
            <div className="setting-inline">
              <input
                id="settings-you"
                name="you"
                defaultValue={profile.name}
                maxLength={NAME_MAX}
                autoComplete="given-name"
                required
              />
            </div>
          </div>
          <div className="setting-row">
            <div>
              <label htmlFor="settings-inbox" className="setting-name">
                Inbox
              </label>
              <p className="setting-hint">
                The address in the top bar. The demo reads the seeded inbox whatever is typed here;
                live Gmail is the next connection (#20).
              </p>
            </div>
            <div className="setting-inline">
              <input
                id="settings-inbox"
                name="inbox"
                type="email"
                defaultValue={profile.inbox}
                maxLength={EMAIL_MAX}
                autoComplete="email"
                required
              />
            </div>
          </div>
          <div className="setting-row">
            <div>
              <p className="setting-name">Using it for</p>
              <p className="setting-hint">Work, school, personal, or the inbox you only skim.</p>
            </div>
            <div
              className="setting-inline setting-choices"
              role="radiogroup"
              aria-label="Using it for"
            >
              {PURPOSES.map((p) => (
                <label key={p.id} className="welcome-choice compact">
                  <input
                    type="radio"
                    name="purpose"
                    value={p.id}
                    defaultChecked={p.id === profile.purpose}
                  />
                  <span className="welcome-choice-label">{p.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="setting-row setting-actions">
            <SubmitButton pendingLabel="Saving…" subtle>
              Save
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="setting-section" aria-labelledby="s-agent">
        <h2 id="s-agent">Your agent</h2>
        <form action={renameAgent} className="setting-row">
          <div>
            <label htmlFor="settings-agent-name" className="setting-name">
              Name
            </label>
            <p className="setting-hint">It signs the drafts it prepares for you.</p>
          </div>
          <div className="setting-inline">
            <input
              id="settings-agent-name"
              name="name"
              defaultValue={agentName}
              maxLength={NAME_MAX}
              autoComplete="off"
              required
            />
            <SubmitButton pendingLabel="Saving…" subtle>
              Save
            </SubmitButton>
          </div>
        </form>
      </section>

      <section className="setting-section" aria-labelledby="s-look">
        <h2 id="s-look">Appearance</h2>
        <div className="setting-row">
          <div>
            <p className="setting-name">Accent, rows and the opening view</p>
            <p className="setting-hint">
              The four state colours stay as they are; they carry meaning. Light or dark is the
              toggle in the top bar.
            </p>
          </div>
        </div>
        <div className="setting-controls">
          <AppearanceControls accent={accent} density={density} home={home} />
        </div>
      </section>

      <section className="setting-section" aria-labelledby="s-notify">
        <h2 id="s-notify">Interruptions</h2>
        <NotificationSetting />
      </section>

      <section className="setting-section" aria-labelledby="s-sources">
        <h2 id="s-sources">Connected sources</h2>
        <div className="setting-row">
          <div>
            <p className="setting-name">Inbox and calendar</p>
            <p className="setting-hint">
              Connected as <strong>{profile.inbox}</strong> for{' '}
              {purposeLabel(profile.purpose).toLowerCase()}. Reading the seeded demo inbox: fifteen
              messages and three events. Live Gmail and Google Calendar are the next connection,
              tracked as #20.
            </p>
          </div>
          <span className="setting-state">Demo fixtures</span>
        </div>
        <div className="setting-row">
          <div>
            <p className="setting-name">Where the agent acts</p>
            <p className="setting-hint">
              Drafts, calendar changes and reminders are recorded on each loop. Real sends go
              through Google once #21 lands; nothing leaves the demo today.
            </p>
          </div>
          <span className="setting-state">Simulated</span>
        </div>
      </section>

      <section className="setting-section" aria-labelledby="s-runtime">
        <h2 id="s-runtime">Runtime</h2>
        <RuntimeLockControl mode={runtimeMode} />
      </section>

      <section className="setting-section" aria-labelledby="s-demo">
        <h2 id="s-demo">Demo</h2>
        <ResetDemo shared={Boolean(LEDGER_TABLE)} />
      </section>
    </div>
  )
}
