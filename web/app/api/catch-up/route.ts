import { invokeCommand, scanConfigured } from '@/lib/agent'
import { CEILING_MESSAGE, withinDailyCeiling } from '@/lib/ceiling'
import { USER_ID } from '@/lib/ledger'
import { isSameOrigin } from '@/lib/same-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** "Catch me up" (SPEC §8D): what changed since the user last asked, written from the ledger only. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers, request.url))
    return Response.json({ error: 'cross-origin' }, { status: 403 })
  if (!scanConfigured) return Response.json({ error: 'not configured' }, { status: 503 })
  if (!(await withinDailyCeiling()))
    return Response.json({ error: CEILING_MESSAGE }, { status: 429 })
  try {
    return Response.json(await invokeCommand(USER_ID, { command: 'catch_up' }))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
