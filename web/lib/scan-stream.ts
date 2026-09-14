import 'server-only'
import { ScanSummary } from '@openloop/shared'

const DATA = 'data: '

/**
 * The runtime's SSE lines on their way to the browser, with the closing summary put through the
 * schema here so the panel receives plain data and Zod stays out of the client bundle. Every other
 * line passes through untouched; a summary that does not parse is dropped, as the panel dropped it,
 * so the scan ends without its closing line rather than with numbers nothing checked.
 */
export function normalizeScanStream(
  stream: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true })
        const parts = buffer.split('\n')
        buffer = parts.pop() ?? ''
        for (const line of parts) {
          const out = normalizeLine(line)
          if (out !== undefined) controller.enqueue(encoder.encode(`${out}\n`))
        }
      },
      flush(controller) {
        buffer += decoder.decode()
        if (buffer === '') return
        const out = normalizeLine(buffer)
        if (out !== undefined) controller.enqueue(encoder.encode(out))
      },
    }),
  )
}

function normalizeLine(line: string): string | undefined {
  if (!line.startsWith(DATA)) return line
  let event: unknown
  try {
    const first = JSON.parse(line.slice(DATA.length))
    event = typeof first === 'string' ? JSON.parse(first) : first
  } catch {
    return line
  }
  if (typeof event !== 'object' || event === null) return line
  const record = event as Record<string, unknown>
  if (record.type !== 'summary') return line
  const summary = ScanSummary.safeParse(record.summary)
  if (!summary.success) return undefined
  return `${DATA}${JSON.stringify({ ...record, summary: summary.data })}`
}
