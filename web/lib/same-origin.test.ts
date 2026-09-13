import { describe, expect, it } from 'vitest'
import { isSameOrigin } from './same-origin'

const url = 'https://openloop-neon.vercel.app/api/scan'

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('isSameOrigin', () => {
  it('accepts the app posting to itself', () => {
    expect(
      isSameOrigin(
        headers({ origin: 'https://openloop-neon.vercel.app', host: 'openloop-neon.vercel.app' }),
        url,
      ),
    ).toBe(true)
  })

  it('accepts a proxied host, which is what Vercel actually sends', () => {
    expect(
      isSameOrigin(
        headers({
          origin: 'https://openloop.example.com',
          host: 'some-internal-host.vercel.app',
          'x-forwarded-host': 'openloop.example.com',
        }),
        'https://some-internal-host.vercel.app/api/scan',
      ),
    ).toBe(true)
  })

  it('accepts localhost in development', () => {
    expect(
      isSameOrigin(
        headers({ origin: 'http://localhost:3000', host: 'localhost:3000' }),
        'http://localhost:3000/api/scan',
      ),
    ).toBe(true)
  })

  it('rejects another site posting to us, which is the CSRF case', () => {
    expect(
      isSameOrigin(
        headers({ origin: 'https://evil.example', host: 'openloop-neon.vercel.app' }),
        url,
      ),
    ).toBe(false)
  })

  it('rejects a request with no Origin at all, which is most scripted abuse', () => {
    expect(isSameOrigin(headers({ host: 'openloop-neon.vercel.app' }), url)).toBe(false)
  })

  it('is not fooled by a lookalike host', () => {
    for (const origin of [
      'https://openloop-neon.vercel.app.evil.example',
      'https://evil.example/?openloop-neon.vercel.app',
      'https://not-openloop-neon.vercel.app',
    ]) {
      expect(isSameOrigin(headers({ origin, host: 'openloop-neon.vercel.app' }), url)).toBe(false)
    }
  })

  it('rejects a malformed Origin rather than throwing', () => {
    expect(isSameOrigin(headers({ origin: 'null', host: 'openloop-neon.vercel.app' }), url)).toBe(
      false,
    )
    expect(isSameOrigin(headers({ origin: '', host: 'openloop-neon.vercel.app' }), url)).toBe(false)
  })

  it('does not match on port alone', () => {
    expect(
      isSameOrigin(
        headers({ origin: 'http://localhost:4000', host: 'localhost:3000' }),
        'http://localhost:3000/api/scan',
      ),
    ).toBe(false)
  })
})
