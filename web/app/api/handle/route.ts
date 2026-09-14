import { invokeCommand, scanConfigured } from '@/lib/agent'
import { CEILING_MESSAGE, withinDailyCeiling } from '@/lib/ceiling'
import { USER_ID } from '@/lib/ledger'
import { isSameOrigin } from '@/lib/same-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** "Handle what you can" (SPEC §8E): the agent executes every allowed proposed action and lists the rest. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers, request.url))
    return Response.json({ error: 'cross-origin' }, { status: 403 })
  if (!scanConfigured) return Response.json({ error: 'not configured' }, { status: 503 })
  if (!(await withinDailyCeiling()))
    return Response.json({ error: CEILING_MESSAGE }, { status: 429 })
  try {
    return Response.json(await invokeCommand(USER_ID, { command: 'handle' }))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
