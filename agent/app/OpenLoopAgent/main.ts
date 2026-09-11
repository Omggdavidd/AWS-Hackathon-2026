import { tmpdir } from 'node:os'
import path from 'node:path'
import { DynamoLedgerStore } from '@openloop/ledger-dynamo'
import { FixtureSource, type LedgerStore, LocalLedgerStore } from '@openloop/shared'
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { z } from 'zod'
import seedInbox from '../../../demo/seed-inbox.json' with { type: 'json' }
import { createSpecialists } from './src/agents'
import { loadModel } from './src/model'
import { runScan } from './src/scan'

/**
 * AgentCore Runtime entry point (ADR-0008). One command today: scan a source into the ledger.
 * Sources and ledgers are chosen by the payload so the same runtime serves the seeded demo and,
 * later, live Gmail and DynamoDB (plan steps 9 and the live-Gmail stretch).
 */
const requestSchema = z.object({
  command: z.literal('scan').default('scan'),
  userId: z.string().min(1),
  /** Without a path, the demo inbox bundled into the runtime is used (the deployed bundle has no demo/ directory). */
  source: z
    .object({ kind: z.literal('fixture'), path: z.string().optional() })
    .default({ kind: 'fixture' }),
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
        : FixtureSource.fromData(seedInbox)
      const store: LedgerStore =
        payload.ledger.kind === 'dynamo'
          ? new DynamoLedgerStore({ tableName: payload.ledger.table })
          : await LocalLedgerStore.fromFile(payload.ledger.path)
      const model = loadModel()
      const specialists = createSpecialists({ model, source, store, userId: payload.userId })
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
