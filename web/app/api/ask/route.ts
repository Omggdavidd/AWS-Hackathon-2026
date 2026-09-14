import { invokeCommand, scanConfigured } from '@/lib/agent'
import { CEILING_MESSAGE, withinDailyCeiling } from '@/lib/ceiling'
import { USER_ID } from '@/lib/ledger'
import { isSameOrigin } from '@/lib/same-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** Ask (SPEC §8G): one question answered from the ledger. The runtime only reads; nothing here executes. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers, request.url))
    return Response.json({ error: 'cross-origin' }, { status: 403 })
  if (!scanConfigured) return Response.json({ error: 'not configured' }, { status: 503 })
  if (!(await withinDailyCeiling()))
    return Response.json({ error: CEILING_MESSAGE }, { status: 429 })
  const body = (await request.json().catch(() => ({}))) as { question?: unknown }
  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (!question || question.length > 500)
    return Response.json({ error: 'ask a question of 500 characters or fewer' }, { status: 400 })
  try {
    return Response.json(await invokeCommand(USER_ID, { command: 'ask', question }))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
