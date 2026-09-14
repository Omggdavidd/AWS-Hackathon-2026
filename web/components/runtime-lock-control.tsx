import type { RuntimeMode } from '@openloop/ledger-dynamo'
import { setRuntimeMode } from '@/app/actions'

const LABEL: Record<RuntimeMode, string> = {
  open: 'Open',
  demo: 'Demo',
  locked: 'Locked',
}

export function RuntimeLockControl({ mode }: { mode: RuntimeMode }) {
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
            Either pause is safe to press publicly. Locked names an incident; Demo names judging or
            recording. Both stop model calls at the runtime.
          </p>
        </div>
        <div className="setting-inline">
          <form action={setRuntimeMode}>
            <input type="hidden" name="mode" value="demo" />
            <button className="setting-button" type="submit" disabled={mode === 'demo'}>
              Demo
            </button>
          </form>
          <form action={setRuntimeMode}>
            <input type="hidden" name="mode" value="locked" />
            <button
              className="setting-button"
              data-danger
              type="submit"
              disabled={mode === 'locked'}
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
            The unlock key is compared on the server and is never stored in the browser or ledger.
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
            required
          />
          <button className="setting-button" type="submit" disabled={mode === 'open'}>
            Resume
          </button>
        </div>
      </form>
    </div>
  )
}
