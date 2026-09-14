import { cookies } from 'next/headers'
import { AgentPanel } from '@/components/agent-panel'
import { LoopBoard } from '@/components/loop-board'
import { scanConfigured } from '@/lib/agent'
import { AGENT_COOKIE, cleanAgentName } from '@/lib/agent-name'
import { formatDateTime } from '@/lib/format'
import { getStore, USER_ID } from '@/lib/ledger'
import { readProfile } from '@/lib/profile'

export const dynamic = 'force-dynamic'

/** The whiteboard: the same loops as draggable groups around a hub (SPEC §7, #83). */
export default async function BoardPage() {
  const jar = await cookies()
  const agentName = cleanAgentName(jar.get(AGENT_COOKIE)?.value)
  const profile = readProfile(jar)
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
      name={profile.name}
      checked={checked}
      storageKey={`openloops:board:${USER_ID}:v1`}
      agent={<AgentPanel configured={scanConfigured} checked={checked} name={agentName} />}
    />
  )
}
