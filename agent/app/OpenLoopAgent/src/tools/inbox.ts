import type { IngestionSource } from '@openloop/shared'
import { tool } from '@strands-agents/sdk'
import { z } from 'zod'
import { renderEvent, renderMessage } from '../render'

/** Read-only tools over the ingestion source (fixtures today, Gmail later; ADR-0006, ADR-0011). */
export function inboxTools(source: IngestionSource) {
  const searchInbox = tool({
    name: 'search_inbox',
    description:
      'Search email messages. Returns up to 10 matches, oldest first, with ids. Use text for keywords (sender, subject, amounts, "payment received"), after/before as ISO dates.',
    inputSchema: z.object({
      text: z.string().optional().describe('Keywords to match in subject, sender or body'),
      after: z.string().optional().describe('ISO date; only messages on or after'),
      before: z.string().optional().describe('ISO date; only messages on or before'),
      threadId: z.string().optional(),
    }),
    callback: async (input) => {
      const query: Parameters<IngestionSource['listMessages']>[0] = {}
      if (input.text) query.text = input.text
      if (input.after) query.after = input.after
      if (input.before) query.before = input.before
      if (input.threadId) query.threadId = input.threadId
      const hits = await source.listMessages(query)
      if (hits.length === 0) return 'No messages matched.'
      return hits.slice(0, 10).map(renderMessage).join('\n\n')
    },
  })

  const getThread = tool({
    name: 'get_thread',
    description: 'Return every message in an email thread, oldest first.',
    inputSchema: z.object({ threadId: z.string() }),
    callback: async ({ threadId }) => {
      const msgs = await source.getThread(threadId)
      return msgs.length === 0 ? 'No such thread.' : msgs.map(renderMessage).join('\n\n')
    },
  })

  const listEvents = tool({
    name: 'list_calendar_events',
    description: 'List calendar events overlapping a date range (ISO dates).',
    inputSchema: z.object({ from: z.string().optional(), to: z.string().optional() }),
    callback: async (input) => {
      const range: { from?: string; to?: string } = {}
      if (input.from) range.from = input.from
      if (input.to) range.to = input.to
      const events = await source.listEvents(range)
      return events.length === 0 ? 'No events in range.' : events.map(renderEvent).join('\n')
    },
  })

  return [searchInbox, getThread, listEvents]
}
