import 'server-only'
import { randomUUID } from 'node:crypto'
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore'
import { LEDGER_TABLE } from './ledger'

/** Deployed AgentCore runtime (ADR-0008). Both values must be set for the Scan button to work. */
export const RUNTIME_ARN = process.env.OPENLOOP_RUNTIME_ARN
export const scanConfigured = Boolean(RUNTIME_ARN && LEDGER_TABLE)

/**
 * Start a scan on the deployed runtime and return its SSE byte stream. The runtime writes loops to the
 * shared DynamoDB table as it goes; the stream carries progress events (`data: "<json>"` lines).
 */
export type ScanVariant = 'base' | 'delta'

export async function invokeScan(
  userId: string,
  variant: ScanVariant = 'base',
): Promise<ReadableStream<Uint8Array>> {
  if (!RUNTIME_ARN || !LEDGER_TABLE)
    throw new Error('OPENLOOP_RUNTIME_ARN and OPENLOOP_LEDGER_TABLE must be set')
  const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
  const res = await client.send(
    new InvokeAgentRuntimeCommand({
      agentRuntimeArn: RUNTIME_ARN,
      runtimeSessionId: `web-${userId}-${randomUUID()}`,
      contentType: 'application/json',
      accept: 'text/event-stream',
      payload: new TextEncoder().encode(
        JSON.stringify({
          command: 'scan',
          userId,
          source: { kind: 'fixture', variant },
          ledger: { kind: 'dynamo', table: LEDGER_TABLE },
        }),
      ),
    }),
  )
  const body = res.response
  if (!body) throw new Error('empty response from runtime')
  return body.transformToWebStream() as ReadableStream<Uint8Array>
}

/** Invoke a non-streaming command (execute, handle) and return the final JSON event. */
export async function invokeCommand(
  userId: string,
  body: { command: 'execute'; actionId: string } | { command: 'handle' } | { command: 'catch_up' },
): Promise<Record<string, unknown>> {
  if (!RUNTIME_ARN || !LEDGER_TABLE)
    throw new Error('OPENLOOP_RUNTIME_ARN and OPENLOOP_LEDGER_TABLE must be set')
  const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? 'us-east-1' })
  const res = await client.send(
    new InvokeAgentRuntimeCommand({
      agentRuntimeArn: RUNTIME_ARN,
      runtimeSessionId: `web-${userId}-${randomUUID()}`,
      contentType: 'application/json',
      accept: 'text/event-stream',
      payload: new TextEncoder().encode(
        JSON.stringify({
          ...body,
          userId,
          source: { kind: 'fixture' },
          ledger: { kind: 'dynamo', table: LEDGER_TABLE },
        }),
      ),
    }),
  )
  const text = (await res.response?.transformToString()) ?? ''
  let last: Record<string, unknown> = {}
  for (const line of text.split('\n')) {
    if (line.startsWith('event: error')) throw new Error('the agent reported an error')
    if (!line.startsWith('data: ')) continue
    try {
      const first = JSON.parse(line.slice(6))
      last = typeof first === 'string' ? JSON.parse(first) : first
    } catch {}
  }
  return last
}
