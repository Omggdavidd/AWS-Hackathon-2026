/**
 * Materialize the packages the AgentCore CDK bundler copies into `_deps`.
 *
 * `@aws/agentcore-cdk` bundles main.ts with esbuild and then copies a fixed list of packages that
 * `bedrock-agentcore` loads with createRequire() at runtime from `<app>/node_modules/<pkg>` into the
 * zip. Under pnpm those packages are transitive (absent from the app's node_modules) or symlinks into
 * the store, and cpSync copies symlinks as symlinks, so the deployed runtime crashed with
 * "Cannot find module '@fastify/sse'". This script resolves each package from bedrock-agentcore's own
 * dependency chain and copies it as a real directory. Run before every deploy (see package.json).
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const appDir = join(dirname(new URL(import.meta.url).pathname), '..')
const cdkPackaging = join(
  appDir,
  '../../agentcore/cdk/node_modules/@aws/agentcore-cdk/dist/lib/packaging/node.js',
)
const listed = existsSync(cdkPackaging)
  ? [
      ...readFileSync(cdkPackaging, 'utf8')
        .match(/DYNAMIC_REQUIRE_PACKAGES\s*=\s*\[(.*?)\];/s)[1]
        .matchAll(/'([^']+)'/g),
    ].map((m) => m[1])
  : [
      '@fastify/sse',
      '@fastify/websocket',
      'duplexify',
      'end-of-stream',
      'fastify-plugin',
      'inherits',
      'once',
      'readable-stream',
      'safe-buffer',
      'stream-shift',
      'string_decoder',
      'util-deprecate',
      'wrappy',
      'ws',
    ]

const roots = [realpathSync(join(appDir, 'node_modules/bedrock-agentcore'))]
const resolved = new Map()
let progress = true
while (progress) {
  progress = false
  for (const pkg of listed) {
    if (resolved.has(pkg)) continue
    for (const root of roots) {
      try {
        const pkgJson = createRequire(join(root, 'package.json')).resolve(`${pkg}/package.json`)
        const dir = realpathSync(dirname(pkgJson))
        resolved.set(pkg, dir)
        roots.push(dir)
        progress = true
        break
      } catch {}
    }
  }
}

const missing = listed.filter((p) => !resolved.has(p))
if (missing.length) {
  console.error(
    `prepare-deploy: could not resolve ${missing.join(', ')} from bedrock-agentcore's dependency chain`,
  )
  process.exit(1)
}
for (const [pkg, src] of resolved) {
  const dest = join(appDir, 'node_modules', pkg)
  if (existsSync(dest) || lstatSync(dest, { throwIfNoEntry: false }))
    rmSync(dest, { recursive: true, force: true })
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, {
    recursive: true,
    dereference: true,
    filter: (p) => !p.includes(`${pkg}/node_modules`),
  })
  console.log(
    `prepare-deploy: ${pkg} <- ${JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version}`,
  )
}
