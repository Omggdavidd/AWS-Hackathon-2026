import { createRequire } from 'node:module'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

export default defineConfig({
  resolve: {
    alias: {
      // Server actions reach their helpers through the same `@/` alias the app uses.
      '@': path.resolve(import.meta.dirname),
      // What Next resolves `server-only` to for server code; the marker package is not installed.
      'server-only': require.resolve('next/dist/compiled/server-only/empty.js'),
    },
  },
  test: { name: 'web', include: ['{app,lib}/**/*.test.ts'] },
})
