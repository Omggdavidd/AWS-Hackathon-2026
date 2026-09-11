import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { name: 'ledger-dynamo', include: ['test/**/*.test.ts'], testTimeout: 30_000 },
})
