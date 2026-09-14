import type { NextConfig } from 'next'

/**
 * Response headers the app has no reason not to send. Deliberately not a Content-Security-Policy:
 * Next injects inline bootstrap script and style, so a useful `script-src` needs per-request
 * nonces, and a broken CSP the day before a submission is worse than a missing one. Tracked in
 * `docs/security.md`.
 */
const securityHeaders = [
  // The ledger renders model output; never let a response be sniffed into something executable.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Nothing here is meant to be embedded, and the agent buttons are one click from real spend.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
]

const nextConfig: NextConfig = {
  transpilePackages: ['@openloop/shared'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
