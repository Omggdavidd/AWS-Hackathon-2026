import { CatchUpButton } from './catch-up-button'
import { HandleButton } from './handle-button'
import { ScanButton } from './scan-button'

/** The agent's four operations, with each result kept beside the control that started it. */
export function AgentToolbar({ configured, checked }: { configured: boolean; checked?: string }) {
  return (
    <div className="agent-toolbar">
      <p className="toolbar-note">
        {configured
          ? checked
            ? `Last checked ${checked}`
            : 'Not checked yet'
          : 'Sample loops. Connect the workspace to run the agent.'}
      </p>
      <div className="agent-controls">
        <CatchUpButton configured={configured} />
        <HandleButton configured={configured} />
        <ScanButton configured={configured} variant="delta" label="Check for new mail" subtle />
        <ScanButton configured={configured} />
      </div>
    </div>
  )
}
