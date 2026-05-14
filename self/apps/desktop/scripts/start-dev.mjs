/**
 * Cross-platform dev launcher for @nous/desktop.
 *
 * Clears ELECTRON_RUN_AS_NODE before starting electron-vite, which is
 * necessary when running inside VSCode/Claude Code (both Electron apps that
 * set this env var, causing the child Electron process to run as plain
 * Node.js without Electron APIs).
 */
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

delete process.env.ELECTRON_RUN_AS_NODE

const root = dirname(fileURLToPath(import.meta.url))

// electron-vite bin lives in the monorepo root node_modules/.bin (pnpm hoisting)
// Walk up to find it: desktop → apps → self → nous-core (root)
const monorepoRoot = resolve(root, '..', '..', '..', '..')
const evite = resolve(monorepoRoot, 'node_modules', '.bin', 'electron-vite')

const NATIVE_MODULE_NAME = 'better-sqlite3'
const NATIVE_RUNTIME_LABEL = 'PATH node'

export function createNativeCompatibilityProbeSource() {
  return `
const result = {
  moduleName: ${JSON.stringify(NATIVE_MODULE_NAME)},
  runtime: ${JSON.stringify(NATIVE_RUNTIME_LABEL)},
  nodeVersion: process.version,
  nodeAbi: process.versions.modules,
};
try {
  require(${JSON.stringify(NATIVE_MODULE_NAME)});
  result.ok = true;
} catch (error) {
  result.ok = false;
  result.errorCode = error && typeof error === 'object' ? error.code : undefined;
  result.errorMessage = error instanceof Error ? error.message : String(error);
}
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
`
}

export function extractNativeAbiVersions(message) {
  const matches = [...String(message ?? '').matchAll(/NODE_MODULE_VERSION\s+(\d+)/g)].map(
    (match) => match[1],
  )

  return {
    compiledAbi: matches[0],
    requiredAbi: matches[1],
  }
}

export function normalizeNativeCompatibilityResult(result, fallback = {}) {
  const diagnostic = {
    moduleName: result?.moduleName ?? NATIVE_MODULE_NAME,
    runtime: result?.runtime ?? NATIVE_RUNTIME_LABEL,
    nodeVersion: result?.nodeVersion ?? fallback.nodeVersion,
    nodeAbi: result?.nodeAbi ?? fallback.nodeAbi,
    errorCode: result?.errorCode,
    remediation: `Rebuild or reinstall ${NATIVE_MODULE_NAME} with the PATH node runtime before launching the desktop app.`,
  }

  const { compiledAbi, requiredAbi } = extractNativeAbiVersions(result?.errorMessage)
  if (compiledAbi) diagnostic.compiledAbi = compiledAbi
  if (requiredAbi) diagnostic.requiredAbi = requiredAbi

  return {
    ok: result?.ok === true,
    diagnostic,
  }
}

export function formatNativeCompatibilityFailure(diagnostic) {
  const details = [
    `[nous:desktop] native compatibility check failed for ${diagnostic.moduleName}`,
    `runtime=${diagnostic.runtime}`,
    diagnostic.nodeVersion ? `node=${diagnostic.nodeVersion}` : undefined,
    diagnostic.nodeAbi ? `abi=${diagnostic.nodeAbi}` : undefined,
    diagnostic.errorCode ? `errorCode=${diagnostic.errorCode}` : undefined,
    diagnostic.compiledAbi ? `compiledAbi=${diagnostic.compiledAbi}` : undefined,
    diagnostic.requiredAbi ? `requiredAbi=${diagnostic.requiredAbi}` : undefined,
    diagnostic.remediation,
  ].filter(Boolean)

  return details.join('\n')
}

export function runNativeCompatibilityCheck({
  spawnSyncImpl = spawnSync,
  nodeCommand = 'node',
  cwd = monorepoRoot,
} = {}) {
  const probe = spawnSyncImpl(nodeCommand, ['-e', createNativeCompatibilityProbeSource()], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
    },
  })

  if (probe.error) {
    return {
      ok: false,
      diagnostic: {
        moduleName: NATIVE_MODULE_NAME,
        runtime: NATIVE_RUNTIME_LABEL,
        errorCode: probe.error.code,
        remediation: `Unable to execute PATH node for the ${NATIVE_MODULE_NAME} compatibility check. Ensure Node.js >=22 is available on PATH.`,
      },
    }
  }

  const output = String(probe.stdout ?? '').trim().split(/\r?\n/).filter(Boolean).at(-1)
  let parsed
  try {
    parsed = output ? JSON.parse(output) : undefined
  } catch {
    parsed = undefined
  }

  if (parsed) {
    return normalizeNativeCompatibilityResult(parsed)
  }

  return {
    ok: false,
    diagnostic: {
      moduleName: NATIVE_MODULE_NAME,
      runtime: NATIVE_RUNTIME_LABEL,
      errorCode: probe.status === null ? 'UNKNOWN' : `EXIT_${probe.status}`,
      remediation: `The ${NATIVE_MODULE_NAME} compatibility check did not produce a valid diagnostic result.`,
    },
  }
}

export function startElectronVite({ spawnImpl = spawn } = {}) {
  return spawnImpl(evite, ['dev'], {
    stdio: 'inherit',
    env: process.env,
    cwd: resolve(root, '..'),
    shell: process.platform === 'win32',
  })
}

export function main() {
  const compatibility = runNativeCompatibilityCheck()
  if (!compatibility.ok) {
    console.error(formatNativeCompatibilityFailure(compatibility.diagnostic))
    process.exit(1)
  }

  console.log(
    `[nous:desktop] native compatibility check passed: module=${compatibility.diagnostic.moduleName} runtime=${compatibility.diagnostic.runtime} node=${compatibility.diagnostic.nodeVersion ?? 'unknown'} abi=${compatibility.diagnostic.nodeAbi ?? 'unknown'}`,
  )

  const ps = startElectronVite()
  ps.on('close', (code) => process.exit(code ?? 1))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
