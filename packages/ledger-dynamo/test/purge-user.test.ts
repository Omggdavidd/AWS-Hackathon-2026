import { Readable } from 'node:stream'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { describe, expect, it } from 'vitest'
import { DynamoLedgerStore } from '../src/index'

/**
 * purgeUser against a hand-written HTTP handler, so batching, UnprocessedItems retries and
 * pagination are exercised without AWS and without a mocking library. The same method runs against
 * a real table when OPENLOOP_DYNAMO_TEST_TABLE is set (dynamo-store.test.ts).
 */
type Call = { target: string; body: Record<string, unknown> }

/** DynamoDB wire shape for a key; the document client unmarshals the response for us. */
const key = (PK: string, SK: string) => ({ PK: { S: PK }, SK: { S: SK } })

class FakeDynamo {
  readonly calls: Call[] = []
  constructor(private readonly respond: (call: Call) => Record<string, unknown>) {}

  async handle(request: { headers: Record<string, string>; body: string }) {
    const target = (request.headers['x-amz-target'] ?? '').split('.').pop() ?? ''
    const call: Call = { target, body: JSON.parse(request.body) }
    this.calls.push(call)
    return {
      response: {
        statusCode: 200,
        headers: { 'content-type': 'application/x-amz-json-1.0' },
        body: Readable.from([JSON.stringify(this.respond(call))]),
      },
    }
  }
}

function storeWith(fake: FakeDynamo, partitionPrefix?: string) {
  const client = new DynamoDBClient({
    region: 'us-east-1',
    credentials: { accessKeyId: 'not-a-real-key', secretAccessKey: 'not-a-real-secret' },
    requestHandler: fake as unknown as DynamoDBClient['config']['requestHandler'],
  })
  return new DynamoLedgerStore({
    tableName: 'tbl',
    client,
    ...(partitionPrefix ? { partitionPrefix } : {}),
  })
}

const attrValue = (call: Call, name: ':pk' | ':sk') =>
  (call.body.ExpressionAttributeValues as Record<string, { S: string }>)[name]?.S ?? ''
const pk = (call: Call) => attrValue(call, ':pk')
const sk = (call: Call) => attrValue(call, ':sk')
type DeleteRequest = { DeleteRequest: { Key: { PK: { S: string }; SK: { S: string } } } }
const deleteRequests = (call: Call): DeleteRequest[] =>
  (call.body.RequestItems as Record<string, DeleteRequest[]>).tbl ?? []

describe('purgeUser', () => {
  it('collects every loop id before deleting and writes keys in batches of 25', async () => {
    const loopIds = Array.from({ length: 30 }, (_, i) => `loop-${i}`)
    const fake = new FakeDynamo((call) => {
      if (call.target !== 'Query') return {}
      if (pk(call) === 'USER#u1' && sk(call) === 'LOOP#')
        return { Items: loopIds.map((id) => key('USER#u1', `LOOP#${id}`)) }
      if (pk(call) === 'USER#u1' && sk(call) === 'ACTION#')
        return { Items: [key('USER#u1', 'ACTION#a1')] }
      if (pk(call) === 'USER#u1' && sk(call) === 'AUDIT#')
        return { Items: [key('USER#u1', 'AUDIT#2026#e1')] }
      return { Items: [key(pk(call), 'EVIDENCE#2026#ev')] }
    })
    const store = storeWith(fake)

    const result = await store.purgeUser('u1')

    expect(result).toEqual({ loops: 30, actions: 1, audit: 1, evidence: 30 })
    const queries = fake.calls.filter((c) => c.target === 'Query')
    const writes = fake.calls.filter((c) => c.target === 'BatchWriteItem')
    expect(queries).toHaveLength(3 + 30)
    // no delete is issued until every query has run, or evidence partitions become unreachable
    expect(fake.calls.findIndex((c) => c.target === 'BatchWriteItem')).toBe(queries.length)
    expect(writes.map((c) => deleteRequests(c).length)).toEqual([25, 25, 12])
    const deleted = writes.flatMap((c) =>
      deleteRequests(c).map((r) => `${r.DeleteRequest.Key.PK.S} ${r.DeleteRequest.Key.SK.S}`),
    )
    expect(deleted).toHaveLength(62)
    expect(deleted).toContain('LOOP#loop-7 EVIDENCE#2026#ev')
    expect(deleted).toContain('USER#u1 LOOP#loop-7')
    expect(deleted).toContain('USER#u1 ACTION#a1')
    expect(deleted).toContain('USER#u1 AUDIT#2026#e1')
  })

  it('retries the keys BatchWriteItem leaves unprocessed', async () => {
    let writes = 0
    const fake = new FakeDynamo((call) => {
      if (call.target === 'Query')
        return sk(call) === 'AUDIT#' ? { Items: [key('USER#u1', 'AUDIT#2026#e1')] } : {}
      writes++
      return writes <= 2
        ? {
            UnprocessedItems: {
              tbl: [{ DeleteRequest: { Key: key('USER#u1', 'AUDIT#2026#e1') } }],
            },
          }
        : { UnprocessedItems: {} }
    })
    const store = storeWith(fake)

    const result = await store.purgeUser('u1')

    expect(result).toEqual({ loops: 0, actions: 0, audit: 1, evidence: 0 })
    expect(fake.calls.filter((c) => c.target === 'BatchWriteItem')).toHaveLength(3)
  })

  it('follows LastEvaluatedKey until the partition is exhausted', async () => {
    const fake = new FakeDynamo((call) => {
      if (call.target !== 'Query' || sk(call) !== 'AUDIT#') return {}
      return call.body.ExclusiveStartKey === undefined
        ? {
            Items: [key('USER#u1', 'AUDIT#1#a'), key('USER#u1', 'AUDIT#2#b')],
            LastEvaluatedKey: key('USER#u1', 'AUDIT#2#b'),
          }
        : { Items: [key('USER#u1', 'AUDIT#3#c')] }
    })
    const store = storeWith(fake)

    const result = await store.purgeUser('u1')

    expect(result.audit).toBe(3)
    const auditQueries = fake.calls.filter((c) => c.target === 'Query' && sk(c) === 'AUDIT#')
    expect(auditQueries).toHaveLength(2)
    expect(auditQueries[1]?.body.ExclusiveStartKey).toEqual(key('USER#u1', 'AUDIT#2#b'))
  })

  it('counts without writing anything on a dry run', async () => {
    const fake = new FakeDynamo((call) => {
      if (call.target !== 'Query') return {}
      if (sk(call) === 'LOOP#') return { Items: [key('USER#u1', 'LOOP#l1')] }
      if (sk(call) === 'EVIDENCE#') return { Items: [key('LOOP#l1', 'EVIDENCE#2026#ev')] }
      return {}
    })
    const store = storeWith(fake)

    const result = await store.purgeUser('u1', { dryRun: true })

    expect(result).toEqual({ loops: 1, actions: 0, audit: 0, evidence: 1 })
    expect(fake.calls.some((c) => c.target === 'BatchWriteItem')).toBe(false)
  })

  it('honours the partition prefix', async () => {
    const fake = new FakeDynamo(() => ({}))
    const store = storeWith(fake, 'run#')

    await store.purgeUser('u1', { dryRun: true })

    expect(fake.calls.map(pk)).toEqual(['run#USER#u1', 'run#USER#u1', 'run#USER#u1'])
  })
})
