import { invokeScan, scanConfigured } from '@/lib/agent'
import { CEILING_MESSAGE, withinDailyCeiling } from '@/lib/ceiling'
import { USER_ID } from '@/lib/ledger'
import { isSameOrigin } from '@/lib/same-origin'
import { normalizeScanStream } from '@/lib/scan-stream'

export const dynamic = 'force-dynamic'
/** A full scan of the demo inbox takes about 95 to 105 seconds on the runtime. */
export const maxDuration = 300

/** Proxies the runtime's SSE progress stream to the browser (SPEC §8A "first-use scan"). */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request.headers, request.url))
    return new Response('Cross-origin requests are not accepted', { status: 403 })
  if (!scanConfigured)
    return new Response('Scan is not configured; see web/.env.example', { status: 503 })
  if (!(await withinDailyCeiling())) return new Response(CEILING_MESSAGE, { status: 429 })
  try {
    const variant = new URL(request.url).searchParams.get('variant') === 'delta' ? 'delta' : 'base'
    const stream = await invokeScan(USER_ID, variant)
    return new Response(normalizeScanStream(stream), {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      },
    })
  } catch (err) {
    return new Response(err instanceof Error ? err.message : 'scan failed', { status: 502 })
  }
}
