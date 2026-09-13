import { cookies } from 'next/headers'
import { AgentPanel } from '@/components/agent-panel'
import { LoopBoard } from '@/components/loop-board'
import { scanConfigured } from '@/lib/agent'
import { AGENT_COOKIE, cleanAgentName } from '@/lib/agent-name'
import { formatDateTime } from '@/lib/format'
import { getStore, USER_ID, USER_NAME } from '@/lib/ledger'

export const dynamic = 'force-dynamic'

/** The whiteboard: the same loops as draggable groups around a hub (SPEC §7, #83). */
export default async function BoardPage() {
  const agentName = cleanAgentName((await cookies()).get(AGENT_COOKIE)?.value)
  const store = await getStore()
  const [loops, audit] = await Promise.all([
    store.listLoops(USER_ID),
    store.listAudit(USER_ID, { limit: 40 }),
  ])
  const lastScan = audit.find((event) => event.kind === 'scan_completed')
  const checked = lastScan ? formatDateTime(lastScan.at) : undefined
  return (
    <LoopBoard
      loops={loops}
      now={new Date().toISOString()}
      name={USER_NAME}
      checked={checked}
      storageKey={`openloops:board:${USER_ID}:v1`}
      agent={<AgentPanel configured={scanConfigured} checked={checked} name={agentName} />}
    />
  )
}
