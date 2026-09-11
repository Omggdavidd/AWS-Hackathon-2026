import { invokeScan, scanConfigured } from '@/lib/agent'
import { USER_ID } from '@/lib/ledger'

export const dynamic = 'force-dynamic'
/** A full scan of the demo inbox takes about four minutes on the runtime. */
export const maxDuration = 300

/** Proxies the runtime's SSE progress stream to the browser (SPEC §8A "first-use scan"). */
export async function POST(): Promise<Response> {
  if (!scanConfigured)
    return new Response('Scan is not configured; see web/.env.example', { status: 503 })
  try {
    const stream = await invokeScan(USER_ID)
    return new Response(stream, {
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
