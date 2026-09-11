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
