/**
 * Deploy the agent: materialize the dynamically loaded packages (prepare-deploy.mjs), then run
 * `agentcore deploy -y --json` from the AgentCore project directory. When launched by pnpm the CLI
 * reports "No agentcore project found" even with the right cwd: it picks up pnpm's npm_ and INIT_CWD
 * variables. They are stripped from the CLI's environment here.
 */

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'

const appDir = join(dirname(new URL(import.meta.url).pathname), '..')
const agentDir = join(appDir, '..', '..')

const prep = spawnSync(process.execPath, [join(appDir, 'scripts', 'prepare-deploy.mjs')], {
  stdio: 'inherit',
})
if (prep.status !== 0) process.exit(prep.status ?? 1)

const args = ['deploy', '-y', '--json', ...process.argv.slice(2)]
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(npm_|PNPM_|INIT_CWD$|NODE_OPTIONS$)/.test(k)),
)
const result = spawnSync('agentcore', args, { cwd: agentDir, stdio: 'inherit', env })
process.exit(result.status ?? 1)
