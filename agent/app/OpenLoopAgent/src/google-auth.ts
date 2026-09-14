import type { AccessToken, GoogleSourceEvent } from '@openloop/shared'
import { z } from 'zod'
import type { Logger } from './log'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
/** Exchange this long before expiry, so a token cannot die between resolving it and using it. */
const EXPIRY_SKEW_MS = 60_000
const DEFAULT_LIFETIME_S = 3600

/**
 * Refresh material the caller already holds. The web app owns the Google OAuth flow (ADR-0011);
 * the runtime never obtains these itself, reads them from no environment variable and stores
 * nothing. They are optional: without them the runtime uses the access token exactly as before.
 */
export const GoogleRefreshSchema = z.object({
  refreshToken: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
})
export type GoogleRefresh = z.infer<typeof GoogleRefreshSchema>

/** A real inbox, read with the short-lived access token the web app obtained (ADR-0011). */
export const GmailSourceSchema = z.object({
  kind: z.literal('gmail'),
  accessToken: z.string().min(1),
  backfillDays: z.number().int().positive().max(3650).default(90),
  refresh: GoogleRefreshSchema.optional(),
})
export type GmailSourceSpec = z.infer<typeof GmailSourceSchema>

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive().default(DEFAULT_LIFETIME_S),
})

export interface TokenDeps {
  fetchImpl?: typeof fetch
  now?: () => number
}

/**
 * The token `GoogleSource` reads with. Without refresh material this is the caller's string, which
 * is what the runtime has always passed. With it, a function: a 90-day backfill makes hundreds of
 * calls and a Google access token lives about an hour, so the source resolves the token per request
 * and this exchanges a fresh one whenever the held one is near its end.
 *
 * The exchanged token is preferred over the supplied one because its lifetime is known; a token
 * handed to us is of unknown age. A 401 while the held token is still young therefore means revoked
 * or under-scoped, not expired, and re-exchanging would not help.
 */
export function googleAccessToken(
  source: { accessToken: string; refresh?: GoogleRefresh | undefined },
  deps: TokenDeps = {},
): AccessToken {
  const refresh = source.refresh
  if (refresh === undefined) return source.accessToken
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const now = deps.now ?? (() => Date.now())
  let cached: { token: string; expiresAt: number } | undefined
  let inFlight: Promise<string> | undefined
  return async () => {
    if (cached !== undefined && now() < cached.expiresAt - EXPIRY_SKEW_MS) return cached.token
    // Messages are fetched several at a time, so several workers resolve at the same moment; one
    // exchange serves all of them, and a failed one is cleared so the next caller may try again.
    inFlight ??= exchange(fetchImpl, refresh)
      .then((issued) => {
        cached = { token: issued.token, expiresAt: now() + issued.lifetimeMs }
        return issued.token
      })
      .finally(() => {
        inFlight = undefined
      })
    return inFlight
  }
}

async function exchange(
  fetchImpl: typeof fetch,
  refresh: GoogleRefresh,
): Promise<{ token: string; lifetimeMs: number }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh.refreshToken,
    client_id: refresh.clientId,
    client_secret: refresh.clientSecret,
  })
  let response: Response
  try {
    response = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch (error) {
    throw fail(error instanceof Error ? error.message : String(error), refresh)
  }
  const text = await response.text().catch(() => '')
  if (!response.ok) throw fail(`${response.status} ${text}`.trim(), refresh)
  const parsed = TokenResponseSchema.safeParse(parseJson(text))
  if (!parsed.success) throw fail('unreadable token response', refresh)
  return { token: parsed.data.access_token, lifetimeMs: parsed.data.expires_in * 1000 }
}

/**
 * Names what failed without ever carrying the credential. Google does not echo the client secret,
 * but the body is its server's text and this error travels into logs and audit reasons, so the
 * secrets are struck from it rather than trusted not to appear.
 */
function fail(detail: string, refresh: GoogleRefresh): Error {
  return new Error(`Google token refresh failed: ${redact(detail, refresh).slice(0, 300)}`)
}

function redact(text: string, refresh: GoogleRefresh): string {
  let out = text
  for (const secret of [refresh.clientSecret, refresh.refreshToken])
    if (secret !== '') out = out.split(secret).join('[redacted]')
  return out
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * What a Gmail listing lost, as pipeline log lines (#30). Ids, reasons and counts only: subjects,
 * bodies and addresses never reach the log.
 */
export function googleSourceLogger(log: Logger): (event: GoogleSourceEvent) => void {
  return (event) => {
    if (event.type === 'message_skipped') {
      log({ evt: 'source_message_skipped', messageId: event.id, reason: event.reason })
      return
    }
    log({
      evt: 'source_truncated',
      kind: event.kind,
      limit: event.limit,
      from: event.covered.from,
      to: event.covered.to,
    })
  }
}
