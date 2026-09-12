import { CatchUpButton } from './catch-up-button'
import { HandleButton } from './handle-button'
import { ScanButton } from './scan-button'

/** Existing agent operations, with results kept beside their initiating control. */
export function AgentToolbar({ configured }: { configured: boolean }) {
  return (
    <div className="agent-toolbar">
      <div className="toolbar-heading">
        <span className="agent-indicator" data-configured={configured} />
        <span>{configured ? 'Your agent' : 'Demo preview'}</span>
      </div>
      <div className="agent-controls">
        <CatchUpButton configured={configured} />
        <HandleButton configured={configured} />
        <ScanButton configured={configured} variant="delta" label="Check for new mail" subtle />
        <ScanButton configured={configured} />
      </div>
      {!configured && (
        <p className="toolbar-note">
          Explore the sample loops below. Agent controls become available when the workspace is
          connected.
        </p>
      )}
    </div>
  )
}
