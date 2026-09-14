import type { RuntimeMode } from '@openloop/ledger-dynamo'
import { setRuntimeMode } from '@/app/actions'

const LABEL: Record<RuntimeMode, string> = {
  open: 'Open',
  demo: 'Demo',
  locked: 'Locked',
}

/**
 * `configured` is the unlock key's presence on the server. Without one, pausing would be a one-way
 * door on a public URL, so every control here is disabled and the action ignores the request too.
 */
export function RuntimeLockControl({
  mode,
  configured,
}: {
  mode: RuntimeMode
  configured: boolean
}) {
  const unavailable = configured ? undefined : 'Available when the unlock key is set'
  return (
    <div className="setting-stack">
      <div className="setting-row">
        <div>
          <p className="setting-name">Model calls</p>
          <p className="setting-hint">
            Open runs the agent. Demo and Locked keep every existing loop, source and timeline
            readable without calling a model.
          </p>
        </div>
        <span className="setting-state">{LABEL[mode]}</span>
      </div>

      <div className="setting-row">
        <div>
          <p className="setting-name">Pause</p>
          <p className="setting-hint">
            {configured
              ? 'Either pause is safe to press publicly. Locked names an incident; Demo names judging or recording. Both stop model calls at the runtime.'
              : 'Set OPENLOOP_UNLOCK_KEY in the deployment to use these. Until then nothing here can pause the agent, because nothing here could resume it.'}
          </p>
        </div>
        <div className="setting-inline">
          <form action={setRuntimeMode}>
            <input type="hidden" name="mode" value="demo" />
            <button
              className="setting-button"
              type="submit"
              disabled={!configured || mode === 'demo'}
              title={unavailable}
            >
              Demo
            </button>
          </form>
          <form action={setRuntimeMode}>
            <input type="hidden" name="mode" value="locked" />
            <button
              className="setting-button"
              data-danger
              type="submit"
              disabled={!configured || mode === 'locked'}
              title={unavailable}
            >
              Lock
            </button>
          </form>
        </div>
      </div>

      <form action={setRuntimeMode} className="setting-row">
        <div>
          <label htmlFor="runtime-unlock-key" className="setting-name">
            Resume
          </label>
          <p className="setting-hint">
            {configured
              ? 'The unlock key is compared on the server and is never stored in the browser or ledger.'
              : 'With no key on the server there is nothing to compare, so Resume is off as well.'}
          </p>
        </div>
        <div className="setting-inline">
          <input type="hidden" name="mode" value="open" />
          <input
            id="runtime-unlock-key"
            name="key"
            type="password"
            autoComplete="off"
            placeholder="Unlock key"
            disabled={!configured}
            required
          />
          <button
            className="setting-button"
            type="submit"
            disabled={!configured || mode === 'open'}
            title={unavailable}
          >
            Resume
          </button>
        </div>
      </form>
    </div>
  )
}
