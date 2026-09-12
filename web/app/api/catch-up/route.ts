import { invokeCommand, scanConfigured } from '@/lib/agent'
import { USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** "Catch me up" (SPEC §8D): what changed since the user last asked, written from the ledger only. */
export async function POST(): Promise<Response> {
  if (!scanConfigured) return Response.json({ error: 'not configured' }, { status: 503 })
  try {
    return Response.json(await invokeCommand(USER_ID, { command: 'catch_up' }))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
