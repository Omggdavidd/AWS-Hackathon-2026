import { FixtureSource, LocalLedgerStore } from '@openloop/shared'
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime'
import { z } from 'zod'
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
  source: z
    .object({ kind: z.literal('fixture'), path: z.string().default('demo/seed-inbox.json') })
    .default({ kind: 'fixture', path: 'demo/seed-inbox.json' }),
  ledger: z
    .object({ kind: z.literal('local'), path: z.string().default('.openloop/ledger.json') })
    .default({ kind: 'local', path: '.openloop/ledger.json' }),
  now: z.string().optional(),
})

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema,
    async *process(payload) {
      const source = await FixtureSource.load(payload.source.path)
      const store = await LocalLedgerStore.fromFile(payload.ledger.path)
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
