import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const aws = vi.hoisted(() => ({
  send: vi.fn(),
  inputs: [] as Record<string, unknown>[],
}))

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = aws.send
  },
  GetItemCommand: class {
    constructor(input: Record<string, unknown>) {
      aws.inputs.push(input)
    }
  },
  PutItemCommand: class {
    constructor(input: Record<string, unknown>) {
      aws.inputs.push(input)
    }
  },
}))

async function load() {
  vi.resetModules()
  return import('../src/runtime-lock')
}

beforeEach(() => {
  aws.send.mockReset()
  aws.inputs.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('runtime lock reads', () => {
  it('defaults open and reads the fixed config row consistently', async () => {
    aws.send.mockResolvedValue({})
    const { getRuntimeMode } = await load()
    expect(await getRuntimeMode({ tableName: 'ledger' })).toBe('open')
    expect(aws.inputs[0]).toMatchObject({
      TableName: 'ledger',
      Key: { PK: { S: 'CONFIG' }, SK: { S: 'RUNTIME_LOCK' } },
      ConsistentRead: true,
    })
  })

  it('allows the row to tighten the environment floor', async () => {
    aws.send.mockResolvedValue({ Item: { mode: { S: 'locked' } } })
    const { getRuntimeMode } = await load()
    expect(await getRuntimeMode({ tableName: 'ledger', defaultMode: 'demo' })).toBe('locked')
  })

  it('never allows the row to loosen the environment floor', async () => {
    aws.send.mockResolvedValue({ Item: { mode: { S: 'open' } } })
    const { getRuntimeMode } = await load()
    expect(await getRuntimeMode({ tableName: 'ledger', defaultMode: 'locked' })).toBe('locked')
  })

  it('falls back to the environment floor when DynamoDB fails', async () => {
    aws.send.mockRejectedValue(new Error('table unavailable'))
    const { getRuntimeMode } = await load()
    expect(await getRuntimeMode({ tableName: 'ledger', defaultMode: 'demo' })).toBe('demo')
  })

  it('caches a read for ten seconds', async () => {
    aws.send.mockResolvedValue({ Item: { mode: { S: 'demo' } } })
    const { getRuntimeMode } = await load()
    expect(await getRuntimeMode({ tableName: 'ledger', now: 100 })).toBe('demo')
    expect(await getRuntimeMode({ tableName: 'ledger', now: 10_099 })).toBe('demo')
    expect(aws.send).toHaveBeenCalledTimes(1)
    await getRuntimeMode({ tableName: 'ledger', now: 10_100 })
    expect(aws.send).toHaveBeenCalledTimes(2)
  })
})

describe('runtime lock writes', () => {
  it('writes outside user partitions and invalidates the cached read', async () => {
    aws.send
      .mockResolvedValueOnce({ Item: { mode: { S: 'open' } } })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Item: { mode: { S: 'locked' } } })
    const { getRuntimeMode, putRuntimeMode } = await load()
    await getRuntimeMode({ tableName: 'ledger', now: 100 })
    await putRuntimeMode('ledger', 'locked')
    expect(aws.inputs[1]).toMatchObject({
      TableName: 'ledger',
      Item: {
        PK: { S: 'CONFIG' },
        SK: { S: 'RUNTIME_LOCK' },
        mode: { S: 'locked' },
      },
    })
    expect(await getRuntimeMode({ tableName: 'ledger', now: 101 })).toBe('locked')
    expect(aws.send).toHaveBeenCalledTimes(3)
  })
})
