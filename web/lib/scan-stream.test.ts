import { describe, expect, it } from 'vitest'
import { normalizeScanStream } from './scan-stream'

async function normalize(...chunks: string[]): Promise<string> {
  const encoder = new TextEncoder()
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  const decoder = new TextDecoder()
  let out = ''
  const reader = normalizeScanStream(source).getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) return out + decoder.decode()
    out += decoder.decode(value, { stream: true })
  }
}

const summaryLine = (summary: unknown) => `data: ${JSON.stringify({ type: 'summary', summary })}\n`
const counts = { threads: 12, skipped: 1, created: 10, updated: 0 }

describe('normalizeScanStream', () => {
  it('fills in the count a runtime deployed before the failure count does not send', async () => {
    expect(await normalize(summaryLine(counts))).toBe(
      summaryLine({ ...counts, failed: 0, byStatus: {} }),
    )
  })

  it('reads the summary the runtime double-encodes', async () => {
    const event = { type: 'summary', summary: { ...counts, failed: 2 } }
    const raw = `data: ${JSON.stringify(JSON.stringify(event))}\n`
    expect(await normalize(raw)).toBe(summaryLine({ ...counts, failed: 2, byStatus: {} }))
  })

  it('passes every other line through untouched', async () => {
    const lines = 'data: {"type":"thread","threadId":"t1","subject":"Rent"}\nevent: error\n\n'
    expect(await normalize(lines)).toBe(lines)
  })

  it('joins a line split across chunks', async () => {
    const line = summaryLine(counts)
    const at = line.indexOf('summary') + 3
    expect(await normalize(line.slice(0, at), line.slice(at))).toBe(
      summaryLine({ ...counts, failed: 0, byStatus: {} }),
    )
  })

  it('drops a summary that does not parse rather than passing numbers on', async () => {
    expect(await normalize(summaryLine({ threads: 'twelve' }))).toBe('')
  })
})
