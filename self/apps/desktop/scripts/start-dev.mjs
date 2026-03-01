/**
 * Cross-platform dev launcher for @nous/desktop.
 *
 * Clears ELECTRON_RUN_AS_NODE before starting electron-vite, which is
 * necessary when running inside VSCode/Claude Code (both Electron apps that
 * set this env var, causing the child Electron process to run as plain
 * Node.js without Electron APIs).
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

delete process.env.ELECTRON_RUN_AS_NODE

const root = dirname(fileURLToPath(import.meta.url))

// electron-vite bin lives in the monorepo root node_modules/.bin (pnpm hoisting)
// Walk up to find it: desktop → apps → self → nous-core (root)
const monorepoRoot = resolve(root, '..', '..', '..', '..')
const evite = resolve(monorepoRoot, 'node_modules', '.bin', 'electron-vite')

const ps = spawn(evite, ['dev'], {
  stdio: 'inherit',
  env: process.env,
  cwd: resolve(root, '..'),
  shell: process.platform === 'win32',
})

ps.on('close', (code) => process.exit(code ?? 1))
