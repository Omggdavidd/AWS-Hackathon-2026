import { relative } from 'node:path'
import { defineConfig } from 'vitest/config'
import type { Reporter, TestModule } from 'vitest/node'

/**
 * A skipped file proves nothing, so in CI it fails the run and names itself. Locally it only
 * prints, so a machine without DynamoDB Local can still run `pnpm check`.
 */
const failOnSkippedFiles: Reporter = {
  onTestRunEnd(testModules: readonly TestModule[]) {
    const skipped = testModules
      .filter((module) => module.state() === 'skipped')
      .map((module) => relative(process.cwd(), module.moduleId))
    if (skipped.length > 0) {
      throw new Error(
        `Skipped test file(s): ${skipped.join(', ')}. A skipped suite verifies nothing: give it what it needs to run, or delete it.`,
      )
    }
  },
}

// Globs tolerate workspaces that do not exist yet; add a vitest.config.ts to each new workspace.
export default defineConfig({
  test: {
    projects: ['packages/*', 'agent/app/*', 'web/vitest.config.*'],
    reporters: process.env.CI ? ['default', failOnSkippedFiles] : ['default'],
  },
})
