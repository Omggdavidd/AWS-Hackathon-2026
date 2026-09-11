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
