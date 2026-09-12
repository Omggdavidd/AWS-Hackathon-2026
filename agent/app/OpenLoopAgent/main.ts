import { tmpdir } from 'node:os'
import path from 'node:path'
import { DynamoLedgerStore } from '@openloop/ledger-dynamo'
import {
  FixtureActionSink,
  FixtureSource,
  type LedgerStore,
  LocalLedgerStore,
} from '@openloop/shared'
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { z } from 'zod'
import seedInbox from '../../../demo/seed-inbox.json' with { type: 'json' }
import seedInboxDelta from '../../../demo/seed-inbox-delta.json' with { type: 'json' }
import { executeAction, handleWhatYouCan } from './src/actions'
import { createSpecialists } from './src/agents'
import { catchUp } from './src/catch-up'
import { loadModel } from './src/model'
import { runScan } from './src/scan'

/**
 * AgentCore Runtime entry point (ADR-0008). One command today: scan a source into the ledger.
 * Sources and ledgers are chosen by the payload so the same runtime serves the seeded demo and,
 * later, live Gmail and DynamoDB (plan steps 9 and the live-Gmail stretch).
 */
const requestSchema = z.object({
  /** scan: ingest into the ledger. handle: execute every allowed proposed action. execute: one action by id (after approval). */
  command: z.enum(['scan', 'handle', 'execute', 'catch_up']).default('scan'),
  /** catch_up: summarize changes since this time; defaults to the previous catch_up or 24 hours ago. */
  since: z.string().optional(),
  actionId: z.string().optional(),
  userId: z.string().min(1),
  /** Without a path, the demo inbox bundled into the runtime is used (the deployed bundle has no demo/ directory). */
  source: z
    .object({
      kind: z.literal('fixture'),
      path: z.string().optional(),
      /** `delta` overlays the next-morning batch (demo/seed-inbox-delta.json) for the delta-path demo. */
      variant: z.enum(['base', 'delta']).default('base'),
    })
    .default({ kind: 'fixture', variant: 'base' }),
  /** Where loops are written. Local JSON is ephemeral on the Runtime; DynamoDB is shared with the web app (ADR-0009). */
  ledger: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('local'),
        path: z.string().default(path.join(tmpdir(), 'openloop-ledger.json')),
      }),
      z.object({ kind: z.literal('dynamo'), table: z.string().min(1) }),
    ])
    .default({ kind: 'local', path: path.join(tmpdir(), 'openloop-ledger.json') }),
  now: z.string().optional(),
})

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema,
    async *process(payload) {
      const source = payload.source.path
        ? await FixtureSource.load(payload.source.path)
        : payload.source.variant === 'delta'
          ? FixtureSource.fromDataWithDelta(seedInbox, seedInboxDelta)
          : FixtureSource.fromData(seedInbox)
      const store: LedgerStore =
        payload.ledger.kind === 'dynamo'
          ? new DynamoLedgerStore({ tableName: payload.ledger.table })
          : await LocalLedgerStore.fromFile(payload.ledger.path)
      const model = loadModel()
      const specialists = createSpecialists({ model, source, store, userId: payload.userId })
      if (payload.command === 'catch_up') {
        const summary = await catchUp({
          store,
          userId: payload.userId,
          specialists,
          ...(payload.now ? { now: payload.now } : {}),
          ...(payload.since ? { since: payload.since } : {}),
        })
        yield { data: JSON.stringify({ type: 'catch_up', ...summary }) }
        return
      }
      if (payload.command !== 'scan') {
        const opts = {
          store,
          source,
          sink: new FixtureActionSink(),
          userId: payload.userId,
          specialists,
          ...(payload.now ? { now: payload.now } : {}),
        }
        if (payload.command === 'execute') {
          if (!payload.actionId) throw new Error('actionId is required for execute')
          yield {
            data: JSON.stringify({
              type: 'executed',
              ...(await executeAction(opts, payload.actionId)),
            }),
          }
        } else {
          yield { data: JSON.stringify({ type: 'handled', ...(await handleWhatYouCan(opts)) }) }
        }
        return
      }
      const events: string[] = []
      const summary = await runScan({
        source,
        store,
        userId: payload.userId,
        specialists,
        ...(payload.now ? { now: payload.now } : {}),
        onEvent: (e) => events.push(JSON.stringify(e)),
      })
      for (const line of events) yield { data: line }
      yield { data: JSON.stringify({ type: 'summary', summary }) }
    },
  },
})

app.run({ port: Number.parseInt(process.env.PORT ?? '8080', 10) })
