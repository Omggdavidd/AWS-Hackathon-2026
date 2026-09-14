/**
 * Every route that invokes the runtime is unauthenticated and each one costs money: a POST to
 * `/api/scan` invokes the deployed runtime and spends a minute and a half or more of Claude Sonnet.
 * There is no session to steal, so this is not a privilege boundary — it is a bill boundary. A
 * state-changing POST with no CSRF token can be fired from any page a browser happens to visit, and
 * the charge lands on the account behind the deployment.
 *
 * Browsers always send `Origin` on a cross-document POST, so requiring it and matching it against
 * the host we were reached on rejects both CSRF and the casual scripted abuse that never sets a
 * header. It does **not** stop anyone willing to send `Origin` by hand; for that see the rate
 * limit and budget alarm in `docs/security.md`.
 *
 * Next's Server Actions compare Origin with Host only when Origin is present and let a request
 * with no Origin through. Route handlers get nothing by default, which is why this exists; the
 * server actions that spend or reset (`approveAction`, `resetDemo`) call it too.
 */
export function isSameOrigin(headers: Headers, url: string): boolean {
  const origin = headers.get('origin')
  if (!origin) return false

  // Behind Vercel the Host header is the deployment host, which is not always the host the browser
  // typed; x-forwarded-host is. Accept either, plus the URL the handler itself was reached on.
  const allowed = new Set(
    [headers.get('x-forwarded-host'), headers.get('host'), safeHost(url)].filter((h): h is string =>
      Boolean(h),
    ),
  )
  const from = safeHost(origin)
  return from !== undefined && allowed.has(from)
}

function safeHost(value: string): string | undefined {
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}
