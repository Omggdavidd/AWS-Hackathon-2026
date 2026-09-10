import { defineConfig } from 'vitest/config'

// Globs tolerate workspaces that do not exist yet; add a vitest.config.ts to each new workspace.
export default defineConfig({
  test: {
    projects: ['packages/*', 'agent/app/*', 'web/vitest.config.*'],
  },
})
