import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The stubbed DynamoDB client. No test in this file may reach AWS. */
const aws = vi.hoisted(() => ({
  send: vi.fn(),
  inputs: [] as Record<string, unknown>[],
}))

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = aws.send
  },
  UpdateItemCommand: class {
    constructor(input: Record<string, unknown>) {
      aws.inputs.push(input)
    }
  },
}))

const env = { ...process.env }

/** `LEDGER_TABLE` and the ceiling are read at import, so the environment is set before loading. */
async function load(over: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries(over)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  vi.resetModules()
  return import('./ceiling')
}

/** What DynamoDB returns from `ADD #used :one` with `ReturnValues: UPDATED_NEW`. */
function counted(used: number) {
  return { Attributes: { used: { N: String(used) } } }
}

beforeEach(() => {
  aws.send.mockReset()
  aws.inputs.length = 0
  process.env.OPENLOOP_LEDGER_TABLE = 'openloop-ledger-test'
  delete process.env.OPENLOOP_DAILY_INVOCATIONS
})

afterEach(() => {
  process.env = { ...env }
})

describe('the daily invocation ceiling', () => {
  it('lets an invocation under the ceiling through', async () => {
    aws.send.mockResolvedValue(counted(7))
    const { withinDailyCeiling } = await load({ OPENLOOP_DAILY_INVOCATIONS: '500' })
    expect(await withinDailyCeiling()).toBe(true)
  })

  it('still allows the last invocation the ceiling covers', async () => {
    aws.send.mockResolvedValue(counted(3))
    const { withinDailyCeiling } = await load({ OPENLOOP_DAILY_INVOCATIONS: '3' })
    expect(await withinDailyCeiling()).toBe(true)
  })

  it('refuses the one after that', async () => {
    aws.send.mockResolvedValue(counted(4))
    const { withinDailyCeiling } = await load({ OPENLOOP_DAILY_INVOCATIONS: '3' })
    expect(await withinDailyCeiling()).toBe(false)
  })

  it('counts with one atomic ADD, keyed by UTC day, and sets a TTL', async () => {
    aws.send.mockResolvedValue(counted(1))
    const { withinDailyCeiling } = await load()
    await withinDailyCeiling()
    expect(aws.inputs).toHaveLength(1)
    const input = aws.inputs[0] as {
      TableName: string
      Key: { PK: { S: string }; SK: { S: string } }
      UpdateExpression: string
      ExpressionAttributeValues: { ':ttl': { N: string } }
    }
    expect(input.TableName).toBe('openloop-ledger-test')
    expect(input.Key.PK.S).toBe(`RATE#${new Date().toISOString().slice(0, 10)}`)
    expect(input.Key.SK.S).toBe('INVOCATIONS')
    // ADD, not a read then a write: two lambdas racing must get 1 and 2, never 1 and 1.
    expect(input.UpdateExpression).toContain('ADD #used :one')
    expect(Number(input.ExpressionAttributeValues[':ttl'].N)).toBeGreaterThan(Date.now() / 1000)
  })

  it('defaults to 500 a day', async () => {
    const { DAILY_CEILING } = await load()
    expect(DAILY_CEILING).toBe(500)
  })
})

/**
 * The property the whole feature is judged on. A limiter that locks a judge out of the live demo
 * costs more than the abuse it prevents, so every failure below has to end in `true`.
 */
describe('failing open', () => {
  it('proceeds when the counter write throws', async () => {
    aws.send.mockRejectedValue(new Error('ResourceNotFoundException: no such table'))
    const { withinDailyCeiling } = await load({ OPENLOOP_DAILY_INVOCATIONS: '1' })
    expect(await withinDailyCeiling()).toBe(true)
  })

  it('proceeds when the counter write is throttled', async () => {
    aws.send.mockRejectedValue(
      Object.assign(new Error('Throughput exceeded'), { name: 'ProvisionedThroughputExceeded' }),
    )
    const { withinDailyCeiling } = await load({ OPENLOOP_DAILY_INVOCATIONS: '1' })
    expect(await withinDailyCeiling()).toBe(true)
  })

  it('proceeds when the response carries no counter', async () => {
    aws.send.mockResolvedValue({})
    const { withinDailyCeiling } = await load({ OPENLOOP_DAILY_INVOCATIONS: '1' })
    expect(await withinDailyCeiling()).toBe(true)
  })

  it('proceeds when the counter is not a number', async () => {
    aws.send.mockResolvedValue({ Attributes: { used: { S: 'plenty' } } })
    const { withinDailyCeiling } = await load({ OPENLOOP_DAILY_INVOCATIONS: '1' })
    expect(await withinDailyCeiling()).toBe(true)
  })

  it('proceeds, and touches no table, when no table is configured', async () => {
    const { withinDailyCeiling } = await load({ OPENLOOP_LEDGER_TABLE: undefined })
    expect(await withinDailyCeiling()).toBe(true)
    expect(aws.send).not.toHaveBeenCalled()
  })

  it('proceeds when the ceiling is set to nonsense', async () => {
    aws.send.mockResolvedValue(counted(9999))
    const { withinDailyCeiling } = await load({ OPENLOOP_DAILY_INVOCATIONS: 'lots' })
    expect(await withinDailyCeiling()).toBe(true)
    expect(aws.send).not.toHaveBeenCalled()
  })
})
