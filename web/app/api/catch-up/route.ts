import { CatchUpSummary } from '@openloop/shared'
import { invokeCommand, scanConfigured } from '@/lib/agent'
import { groupCatchUp } from '@/lib/catch-up'
import { CEILING_MESSAGE, withinDailyCeiling } from '@/lib/ceiling'
import { loadLoops, USER_ID } from '@/lib/ledger'
import { isSameOrigin } from '@/lib/same-origin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * "Catch me up" (SPEC §8D): what changed since the user last asked, written from the ledger only,
 * then grouped by urgency against the loops as they stand now, so what needs you first reads first.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers, request.url))
    return Response.json({ error: 'cross-origin' }, { status: 403 })
  if (!scanConfigured) return Response.json({ error: 'not configured' }, { status: 503 })
  if (!(await withinDailyCeiling()))
    return Response.json({ error: CEILING_MESSAGE }, { status: 429 })
  try {
    const summary = CatchUpSummary.safeParse(await invokeCommand(USER_ID, { command: 'catch_up' }))
    if (!summary.success)
      return Response.json(
        { error: 'The agent answered, but not with a catch-up the app could read.' },
        { status: 502 },
      )
    const loops = await loadLoops(USER_ID)
    return Response.json(groupCatchUp(summary.data, loops, new Date()))
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'failed' }, { status: 502 })
  }
}
