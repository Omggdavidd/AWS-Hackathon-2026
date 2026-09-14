import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The five paths that spend Bedrock, checked at the boundary the UI actually sees: `agent-panel`
 * reads `res.text()` for a failed scan and `body.error` for handle and catch-up, `command-bar`
 * reads `body.error` for ask, and a server action surfaces a thrown message. Nothing here reaches
 * AWS.
 */
const aws = vi.hoisted(() => ({ send: vi.fn() }))
const agent = vi.hoisted(() => ({ invokeScan: vi.fn(), invokeCommand: vi.fn() }))

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    send = aws.send
  },
  UpdateItemCommand: class {},
}))

vi.mock('@/lib/agent', () => ({
  scanConfigured: true,
  invokeScan: agent.invokeScan,
  invokeCommand: agent.invokeCommand,
}))

vi.mock('@/lib/ledger', () => ({
  USER_ID: 'user-alex',
  LEDGER_TABLE: 'openloop-ledger-test',
  getStore: async () => ({ getAction: async () => undefined }),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }),
  cookies: async () => ({ get: () => undefined, set: () => {} }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next/navigation', () => ({ redirect: () => {} }))

const env = { ...process.env }

/** Third invocation of a day that allows two: over the ceiling. */
const OVER = { Attributes: { used: { N: '3' } } }
/** First invocation of a day that allows two: under it. */
const UNDER = { Attributes: { used: { N: '1' } } }

async function load(ceiling = '2') {
  process.env.OPENLOOP_DAILY_INVOCATIONS = ceiling
  vi.resetModules()
  return {
    scan: (await import('./scan/route')).POST,
    handle: (await import('./handle/route')).POST,
    catchUp: (await import('./catch-up/route')).POST,
    ask: (await import('./ask/route')).POST,
    actions: await import('../actions'),
    CEILING_MESSAGE: (await import('@/lib/ceiling')).CEILING_MESSAGE,
  }
}

function post(path: string): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { origin: 'http://localhost:3000' },
  })
}

/** Ask refuses an empty question before it reaches the runtime, so the body has to be real. */
function ask(): Request {
  return new Request('http://localhost:3000/api/ask', {
    method: 'POST',
    headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'What is due today?' }),
  })
}

beforeEach(() => {
  aws.send.mockReset()
  agent.invokeScan.mockReset().mockResolvedValue(new ReadableStream())
  agent.invokeCommand.mockReset().mockResolvedValue({ ok: true })
})

afterEach(() => {
  process.env = { ...env }
})

describe('under the ceiling', () => {
  it('scans', async () => {
    aws.send.mockResolvedValue(UNDER)
    const { scan } = await load()
    expect((await scan(post('/api/scan'))).status).toBe(200)
    expect(agent.invokeScan).toHaveBeenCalledOnce()
  })

  it('handles and catches up', async () => {
    aws.send.mockResolvedValue(UNDER)
    const { handle, catchUp } = await load()
    expect((await handle(post('/api/handle'))).status).toBe(200)
    expect((await catchUp(post('/api/catch-up'))).status).toBe(200)
    expect(agent.invokeCommand).toHaveBeenCalledTimes(2)
  })

  it('asks', async () => {
    aws.send.mockResolvedValue(UNDER)
    const { ask: route } = await load()
    expect((await route(ask())).status).toBe(200)
    expect(agent.invokeCommand).toHaveBeenCalledOnce()
  })

  it('approves', async () => {
    aws.send.mockResolvedValue(UNDER)
    const { actions } = await load()
    await expect(actions.approveAction('action-1')).resolves.toBeUndefined()
  })
})

describe('at the ceiling', () => {
  it('refuses a scan as text, which is what the agent panel reads from a failed scan', async () => {
    aws.send.mockResolvedValue(OVER)
    const { scan, CEILING_MESSAGE } = await load()
    const res = await scan(post('/api/scan'))
    expect(res.status).toBe(429)
    expect(await res.text()).toBe(CEILING_MESSAGE)
    expect(agent.invokeScan).not.toHaveBeenCalled()
  })

  it('refuses handle as { error }, which is the shape the agent panel renders', async () => {
    aws.send.mockResolvedValue(OVER)
    const { handle, CEILING_MESSAGE } = await load()
    const res = await handle(post('/api/handle'))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: CEILING_MESSAGE })
    expect(agent.invokeCommand).not.toHaveBeenCalled()
  })

  it('refuses catch-up as { error }', async () => {
    aws.send.mockResolvedValue(OVER)
    const { catchUp, CEILING_MESSAGE } = await load()
    const res = await catchUp(post('/api/catch-up'))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: CEILING_MESSAGE })
    expect(agent.invokeCommand).not.toHaveBeenCalled()
  })

  it('refuses ask as { error }, which is the shape the command bar renders', async () => {
    aws.send.mockResolvedValue(OVER)
    const { ask: route, CEILING_MESSAGE } = await load()
    const res = await route(ask())
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual({ error: CEILING_MESSAGE })
    expect(agent.invokeCommand).not.toHaveBeenCalled()
  })

  it('refuses an approval by throwing, as the origin guard beside it already does', async () => {
    aws.send.mockResolvedValue(OVER)
    const { actions, CEILING_MESSAGE } = await load()
    await expect(actions.approveAction('action-1')).rejects.toThrow(CEILING_MESSAGE)
    expect(agent.invokeCommand).not.toHaveBeenCalled()
  })
})

/** A broken counter must never be what stops a judge mid-demo. */
describe('a counter that fails', () => {
  it('lets the scan through anyway', async () => {
    aws.send.mockRejectedValue(new Error('dynamodb unreachable'))
    const { scan } = await load('1')
    expect((await scan(post('/api/scan'))).status).toBe(200)
    expect(agent.invokeScan).toHaveBeenCalledOnce()
  })

  it('lets handle and catch-up through anyway', async () => {
    aws.send.mockRejectedValue(new Error('dynamodb unreachable'))
    const { handle, catchUp } = await load('1')
    expect((await handle(post('/api/handle'))).status).toBe(200)
    expect((await catchUp(post('/api/catch-up'))).status).toBe(200)
  })

  it('lets ask through anyway', async () => {
    aws.send.mockRejectedValue(new Error('dynamodb unreachable'))
    const { ask: route } = await load('1')
    expect((await route(ask())).status).toBe(200)
    expect(agent.invokeCommand).toHaveBeenCalledOnce()
  })

  it('lets an approval through anyway', async () => {
    aws.send.mockRejectedValue(new Error('dynamodb unreachable'))
    const { actions } = await load('1')
    await expect(actions.approveAction('action-1')).resolves.toBeUndefined()
  })
})
