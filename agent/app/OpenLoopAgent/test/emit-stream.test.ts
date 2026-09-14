import { describe, expect, it } from 'vitest'
import { type Emitted, emitStream } from '../src/emit-stream'

/** Resolves on the next macrotask, so an emitting job can be suspended mid-run. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('emitStream', () => {
  it('yields an event before the job finishes', async () => {
    let finish!: () => void
    const finished = new Promise<void>((resolve) => {
      finish = resolve
    })
    let done = false
    const stream = emitStream<string, 'summary'>(async (emit) => {
      emit('first')
      await finished
      done = true
      return 'summary'
    })

    const first = await stream.next()

    expect(first.value).toEqual({ kind: 'event', event: 'first' })
    expect(done).toBe(false)

    finish()
    const rest: Emitted<string, 'summary'>[] = []
    for await (const emitted of stream) rest.push(emitted)
    expect(rest).toEqual([{ kind: 'result', result: 'summary' }])
  })

  it('delivers each event while the job is still running, not in one burst at the end', async () => {
    const arrivals: string[] = []
    const stream = emitStream<string, number>(async (emit) => {
      for (const name of ['a', 'b', 'c']) {
        emit(name)
        arrivals.push(`emitted ${name}`)
        await tick()
      }
      return 3
    })

    for await (const emitted of stream) {
      arrivals.push(
        emitted.kind === 'event' ? `yielded ${emitted.event}` : `yielded result ${emitted.result}`,
      )
    }

    expect(arrivals).toEqual([
      'emitted a',
      'yielded a',
      'emitted b',
      'yielded b',
      'emitted c',
      'yielded c',
      'yielded result 3',
    ])
  })

  it('keeps emission order and puts the result last', async () => {
    const stream = emitStream<number, string>(async (emit) => {
      emit(1)
      emit(2)
      await tick()
      emit(3)
      return 'end'
    })

    const seen: Emitted<number, string>[] = []
    for await (const emitted of stream) seen.push(emitted)

    expect(seen).toEqual([
      { kind: 'event', event: 1 },
      { kind: 'event', event: 2 },
      { kind: 'event', event: 3 },
      { kind: 'result', result: 'end' },
    ])
  })

  it('flushes what was emitted before a failure, then rethrows it', async () => {
    const boom = new Error('thread pipeline threw')
    const stream = emitStream<string, never>(async (emit) => {
      emit('kept')
      await tick()
      throw boom
    })

    const seen: Emitted<string, never>[] = []
    await expect(async () => {
      for await (const emitted of stream) seen.push(emitted)
    }).rejects.toThrow(boom)
    expect(seen).toEqual([{ kind: 'event', event: 'kept' }])
  })

  it('yields the result of a job that emits nothing', async () => {
    const seen: Emitted<string, number>[] = []
    for await (const emitted of emitStream<string, number>(async () => 0)) seen.push(emitted)

    expect(seen).toEqual([{ kind: 'result', result: 0 }])
  })

  it('does not reject when the consumer stops reading before the job settles', async () => {
    const stream = emitStream<string, string>(async (emit) => {
      emit('first')
      await tick()
      throw new Error('failed after the consumer left')
    })

    expect(await stream.next()).toMatchObject({ value: { kind: 'event', event: 'first' } })
    await stream.return(undefined)
    await tick()
    await tick()
  })
})
