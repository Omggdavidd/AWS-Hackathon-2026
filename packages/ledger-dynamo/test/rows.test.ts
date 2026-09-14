import { Readable } from 'node:stream'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { ProposedAction } from '@openloop/shared'
import { describe, expect, it } from 'vitest'
import { DynamoLedgerStore } from '../src/index'

/**
 * What a row looks like on the wire, and what comes back off it. `type` does double duty: it is the
 * row marker for loops, evidence and audit events, and a real field on a ProposedAction. These
 * tests pin which of the two each row kind gets, so nothing is left to the spread order in put().
 */
type Item = Record<string, { S?: string; N?: string; BOOL?: boolean; M?: unknown; L?: unknown }>

class Table {
  readonly items = new Map<string, Item>()
  async handle(request: { headers: Record<string, string>; body: string }) {
    const target = (request.headers['x-amz-target'] ?? '').split('.').pop() ?? ''
    const body = JSON.parse(request.body)
    let out: Record<string, unknown> = {}
    if (target === 'PutItem') {
      const item = body.Item as Item
      this.items.set(`${item.PK?.S}|${item.SK?.S}`, item)
    } else if (target === 'GetItem') {
      const item = this.items.get(`${body.Key.PK.S}|${body.Key.SK.S}`)
      out = item ? { Item: item } : {}
    }
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/x-amz-json-1.0' },
        body: Readable.from([JSON.stringify(out)]),
      },
    }
  }
}

function storeWith(table: Table) {
  const client = new DynamoDBClient({
    region: 'us-east-1',
    credentials: { accessKeyId: 'not-a-real-key', secretAccessKey: 'not-a-real-secret' },
    requestHandler: table as unknown as DynamoDBClient['config']['requestHandler'],
  })
  return new DynamoLedgerStore({ tableName: 'tbl', client })
}

const action = (overrides: Partial<ProposedAction> = {}): ProposedAction => ({
  id: 'a1',
  loopId: 'loop-1',
  userId: 'user-1',
  type: 'draft_email',
  riskTier: 'medium',
  requiresApproval: false,
  summary: 'Draft reply',
  payload: {},
  status: 'PROPOSED',
  createdAt: '2026-09-10T13:00:00.000Z',
  ...overrides,
})

describe('row markers', () => {
  it('marks an action row with the action type, never with a row marker', async () => {
    const table = new Table()
    const store = storeWith(table)
    await store.putAction(action())
    expect(table.items.get('USER#user-1|ACTION#a1')?.type).toEqual({ S: 'draft_email' })
    expect(await store.getAction('user-1', 'a1')).toMatchObject({ type: 'draft_email' })
  })

  it('keeps an action type that happens to read like a row marker', async () => {
    const table = new Table()
    const store = storeWith(table)
    // No ProposedActionType is 'loop' today. If one is ever added, or any future record takes a
    // marker value in `type`, reading it must not silently delete the field.
    await store.putAction(action({ type: 'loop' as ProposedAction['type'] }))
    expect(table.items.get('USER#user-1|ACTION#a1')?.type).toEqual({ S: 'loop' })
    expect(await store.getAction('user-1', 'a1')).toMatchObject({ type: 'loop' })
  })
})
