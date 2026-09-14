/**
 * Turns a callback-emitting job into an async generator that yields while the job is still
 * running. A scan takes about a hundred seconds and its progress is the whole point of the
 * dashboard filling in live, so the events cannot wait for the promise to settle before the
 * runtime's SSE generator hands them over (main.ts, #8A).
 */
export type Emitted<E, R> = { kind: 'event'; event: E } | { kind: 'result'; result: R }

/**
 * `run` gets a synchronous `emit`; everything it emits is yielded in emission order, as it
 * arrives, followed by exactly one `result`. If `run` rejects, whatever it emitted first is still
 * yielded and the rejection is then rethrown from the generator, so a caller streaming to a client
 * shows the progress that did happen before the failure surfaces.
 */
export async function* emitStream<E, R>(
  run: (emit: (event: E) => void) => Promise<R>,
): AsyncGenerator<Emitted<E, R>> {
  const queue: E[] = []
  let wake: (() => void) | undefined
  const nudge = () => {
    const resume = wake
    wake = undefined
    resume?.()
  }
  let settled = false
  let failure: unknown
  let failed = false
  let result: R | undefined

  const finished = run((event) => {
    queue.push(event)
    nudge()
  }).then(
    (value) => {
      result = value
      settled = true
      nudge()
    },
    (err) => {
      failure = err
      failed = true
      settled = true
      nudge()
    },
  )

  while (true) {
    while (queue.length > 0) {
      const event = queue.shift() as E
      yield { kind: 'event', event }
    }
    if (settled) break
    await new Promise<void>((resolve) => {
      wake = resolve
    })
  }
  await finished
  if (failed) throw failure
  yield { kind: 'result', result: result as R }
}
