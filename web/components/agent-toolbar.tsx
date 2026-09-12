import { CatchUpButton } from './catch-up-button'
import { HandleButton } from './handle-button'
import { ScanButton } from './scan-button'

/** The agent's four verbs in one row; each button renders its own progress or result below the row. */
export function AgentToolbar({ configured }: { configured: boolean }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ScanButton configured={configured} />
        <ScanButton configured={configured} variant="delta" label="Check for new mail" subtle />
        <HandleButton configured={configured} />
        <CatchUpButton configured={configured} />
      </div>
      {!configured && (
        <p className="text-xs text-muted">
          Showing the seeded demo ledger. Set the runtime and table in <code>web/.env.local</code>{' '}
          to let the agent run.
        </p>
      )}
    </div>
  )
}
