import type { LedgerStore } from '@openloop/shared'
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'

/** Read-only view of the ledger for agents that need to know what is already tracked (ADR-0004). */
export function ledgerTools(store: LedgerStore, userId: string) {
  const findOpenLoops = tool({
    name: 'find_open_loops',
    description:
      'List loops already tracked for this user, optionally filtered by status. Use to avoid duplicates.',
    inputSchema: z.object({
      status: z.enum(['NEEDS_YOU', 'WAITING', 'WATCHING', 'RESOLVED', 'UNCERTAIN']).optional(),
    }),
    callback: async ({ status }) => {
      const loops = await store.listLoops(userId, status ? { status } : {})
      if (loops.length === 0) return 'No loops tracked yet.'
      return loops
        .map(
          (l) =>
            `${l.id} [${l.status}] ${l.title}${l.dueAt ? ` due ${l.dueAt}` : ''} sources=${l.sourceRefs.map((r) => r.sourceId).join(',')}`,
        )
        .join('\n')
    },
  })
  return [findOpenLoops]
}

/**
 * Why a loop is in the state it is in, from the evidence already recorded. Kept out of `ledgerTools`
 * on purpose: the Investigator is calibrated against the inbox tools and does not need it.
 */
export function loopEvidenceTool(store: LedgerStore, userId: string) {
  return tool({
    name: 'get_loop_evidence',
    description:
      'Read what the agent observed for one tracked loop: each excerpt, its source id, what it did to the loop and how sure the agent was. Read-only. Use it to explain why a loop is in its state.',
    inputSchema: z.object({ loopId: z.string() }),
    callback: async ({ loopId }) => {
      const loop = await store.getLoop(userId, loopId)
      if (!loop) return 'No such loop.'
      const head = `${loop.id} [${loop.status}] ${loop.title}${loop.nextAction ? ` next=${loop.nextAction}` : ''}`
      const evidence = await store.listEvidence(loopId)
      if (evidence.length === 0) return `${head}\nNo evidence recorded.`
      return [
        head,
        ...evidence.map(
          (e) =>
            `${e.observedAt} ${e.sourceId} (${e.supports}, confidence ${e.confidence}): ${e.excerpt}`,
        ),
      ].join('\n')
    },
  })
}
