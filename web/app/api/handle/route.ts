import { invokeCommand, scanConfigured } from '@/lib/agent'
import { USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** "Handle what you can" (SPEC §8E): the agent executes every allowed proposed action and lists the rest. */
export async function POST(): Promise<Response> {
  if (!scanConfigured) return Response.json({ error: 'not configured' }, { status: 503 })
  try {
    return Response.json(await invokeCommand(USER_ID, { command: 'handle' }))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
