import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { execFile, fork, spawn, type ChildProcess } from 'node:child_process'
import { promisify } from 'node:util'
import { readdir, readFile } from 'node:fs/promises'
import Store from 'electron-store'
import { createTRPCClient, httpBatchLink } from '@trpc/client'
import {
  detectOllama,
  pullOllamaModel,
  resolveOllamaBinary,
  type OllamaLifecycleState,
  type OllamaModelPullProgress,
  type OllamaStatus,
} from '../../../shared-server/src/ollama-detection'
import {
  createDefaultFirstRunState,
  type FirstRunActionResult,
  type FirstRunPrerequisites,
  type FirstRunRoleAssignmentInput,
  type FirstRunState,
  type FirstRunStep,
} from '../../../shared-server/src/first-run'
import type {
  HardwareSpec,
  RecommendationResult,
} from '../../../shared-server/src/hardware-detection'
import superjson from 'superjson'

interface StoredLayout {
  version: 1
  layout: unknown
  savedAt: string
}

const store = new Store<{ layoutStore: StoredLayout | undefined }>()
const execFileAsync = promisify(execFile)

// Hoisted window reference — needed by IPC handlers registered before createWindow
let win: BrowserWindow | null = null

// ━━━ CRITICAL: Backend Child Process ━━━ DO NOT REMOVE — see fix/desktop-backend-wiring

let backendChild: ChildProcess | null = null
let backendPort: number | null = null
let backendReady = false
let backendReadyPromise: Promise<number> | null = null
let isAppQuitting = false
let shutdownCleanupComplete = false

type BackendOllamaRequestAction = 'getStatus' | 'start' | 'stop'

interface BackendOllamaRequestMessage {
  type: 'ollama:request'
  requestId: string
  action: BackendOllamaRequestAction
}

interface BackendOllamaResponseMessage {
  type: 'ollama:response'
  requestId: string
  ok: boolean
  data?: unknown
  error?: string
}

const OLLAMA_HEALTH_INTERVAL_MS = 10_000
const OLLAMA_HEALTH_FAILURE_THRESHOLD = 3
const OLLAMA_READY_TIMEOUT_MS = 30_000
const OLLAMA_READY_POLL_INTERVAL_MS = 500
const BACKEND_STOP_TIMEOUT_MS = 5000
const OLLAMA_STOP_TIMEOUT_MS = 5000
const OLLAMA_MAX_RESTARTS = 5
const APP_SHUTDOWN_TIMEOUT_MS = 10_000

let ollamaChild: ChildProcess | null = null
let ollamaState: OllamaLifecycleState = 'not_installed'
let ollamaStatus: OllamaStatus = {
  installed: false,
  running: false,
  state: 'not_installed',
  models: [],
  defaultModel: null,
}
let isOllamaManaged = false
let ollamaHealthInterval: ReturnType<typeof setInterval> | null = null
let ollamaHealthFailures = 0
let ollamaRestartCount = 0
let ollamaRestartTimer: ReturnType<typeof setTimeout> | null = null
let ollamaStartPromise: Promise<OllamaStatus> | null = null
let ollamaStopPromise: Promise<void> | null = null
let ollamaSuppressRestartOnExit = false
let ollamaHealthCheckInFlight = false
let activeOllamaPull: Promise<void> | null = null

function buildOllamaStatus(
  state: OllamaLifecycleState,
  options?: {
    models?: string[]
    error?: string
  },
): OllamaStatus {
  const models = options?.models ?? []

  return {
    installed: state !== 'not_installed',
    running: state === 'running',
    state,
    models,
    defaultModel: models[0] ?? null,
    ...(options?.error ? { error: options.error } : {}),
  }
}

function clearOllamaRestartTimer(): void {
  if (ollamaRestartTimer) {
    clearTimeout(ollamaRestartTimer)
    ollamaRestartTimer = null
  }
}

function clearOllamaHealthMonitor(): void {
  if (ollamaHealthInterval) {
    clearInterval(ollamaHealthInterval)
    ollamaHealthInterval = null
  }
  ollamaHealthFailures = 0
  ollamaHealthCheckInFlight = false
}

function emitOllamaStateChanged(nextStatus = ollamaStatus): void {
  win?.webContents.send('ollama:stateChanged', nextStatus)
}

function setOllamaStatus(nextStatus: OllamaStatus): OllamaStatus {
  ollamaState = nextStatus.state
  ollamaStatus = nextStatus
  emitOllamaStateChanged(nextStatus)
  return nextStatus
}

function setOllamaState(
  state: OllamaLifecycleState,
  options?: {
    models?: string[]
    error?: string
  },
): OllamaStatus {
  return setOllamaStatus(buildOllamaStatus(state, options))
}

function getOllamaRestartDelay(restartCount: number): number {
  return Math.min(2000 * 2 ** restartCount, 30_000)
}

function isBackendOllamaRequestMessage(value: unknown): value is BackendOllamaRequestMessage {
  return typeof value === 'object' &&
    value !== null &&
    (value as { type?: string }).type === 'ollama:request' &&
    typeof (value as { requestId?: string }).requestId === 'string' &&
    (
      (value as { action?: string }).action === 'getStatus' ||
      (value as { action?: string }).action === 'start' ||
      (value as { action?: string }).action === 'stop'
    )
}

async function refreshOllamaStatus(): Promise<OllamaStatus> {
  if (ollamaState === 'starting' || ollamaState === 'stopping') {
    return ollamaStatus
  }

  if (ollamaState === 'error') {
    return ollamaStatus
  }

  const detected = await detectOllama()
  return setOllamaStatus(detected)
}

function scheduleOllamaRestart(reason: string): void {
  if (isAppQuitting || !isOllamaManaged) {
    return
  }

  if (ollamaRestartCount >= OLLAMA_MAX_RESTARTS) {
    setOllamaState('error', {
      error: `Ollama restart limit reached after ${reason}.`,
    })
    return
  }

  clearOllamaRestartTimer()

  const delay = getOllamaRestartDelay(ollamaRestartCount)
  const attempt = ollamaRestartCount + 1
  ollamaRestartCount += 1
  console.log(`[nous:desktop] ollama restart attempt ${attempt}/${OLLAMA_MAX_RESTARTS} (backoff=${delay}ms)`)

  ollamaRestartTimer = setTimeout(() => {
    ollamaRestartTimer = null
    if (!isAppQuitting) {
      startOllama().catch((err) => {
        console.error('[nous:desktop] ollama restart failed:', err)
      })
    }
  }, delay)
  ollamaRestartTimer.unref()
}

async function waitForOllamaReady(): Promise<OllamaStatus> {
  const start = Date.now()

  while (Date.now() - start < OLLAMA_READY_TIMEOUT_MS) {
    const detected = await detectOllama()
    if (detected.state === 'running') {
      return detected
    }

    await new Promise((resolve) => setTimeout(resolve, OLLAMA_READY_POLL_INTERVAL_MS))
  }

  throw new Error(`Ollama did not become ready within ${OLLAMA_READY_TIMEOUT_MS / 1000}s.`)
}

function attachOllamaProcessListeners(child: ChildProcess): void {
  child.on('error', (err) => {
    console.error('[nous:desktop] ollama process error:', err)
  })

  child.on('exit', (code, signal) => {
    console.log(`[nous:desktop] ollama process exited (code=${code}, signal=${signal})`)

    if (ollamaChild === child) {
      ollamaChild = null
    }

    clearOllamaHealthMonitor()

    const expectedExit =
      ollamaSuppressRestartOnExit ||
      isAppQuitting ||
      !isOllamaManaged ||
      ollamaState === 'stopping'

    if (expectedExit) {
      ollamaSuppressRestartOnExit = false
      if (ollamaState !== 'error') {
        setOllamaState('installed_stopped')
      }
      return
    }

    setOllamaState('installed_stopped')
    scheduleOllamaRestart(`unexpected exit (code=${code}, signal=${signal})`)
  })
}

async function terminateManagedOllamaProcess(child: ChildProcess): Promise<void> {
  const exitPromise = new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
  })

  if (process.platform === 'win32') {
    if (child.pid) {
      try {
        await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
      } catch {
        try {
          child.kill('SIGKILL')
        } catch {
          // Ignore force-kill failures during shutdown cleanup.
        }
      }
    }

    await exitPromise
    return
  }

  try {
    child.kill('SIGTERM')
  } catch {
    return
  }

  const forceKillTimer = setTimeout(() => {
    if (ollamaChild === child) {
      try {
        child.kill('SIGKILL')
      } catch {
        // Ignore force-kill failures during shutdown cleanup.
      }
    }
  }, OLLAMA_STOP_TIMEOUT_MS)
  forceKillTimer.unref()

  await exitPromise.finally(() => clearTimeout(forceKillTimer))
}

function startOllamaHealthMonitor(): void {
  clearOllamaHealthMonitor()

  ollamaHealthInterval = setInterval(() => {
    if (ollamaHealthCheckInFlight || ollamaState !== 'running') {
      return
    }

    ollamaHealthCheckInFlight = true
    void detectOllama()
      .then((detected) => {
        if (detected.state === 'running') {
          ollamaHealthFailures = 0
          if (ollamaRestartCount > 0) {
            ollamaRestartCount = 0
          }
          setOllamaStatus(detected)
          return
        }

        ollamaHealthFailures += 1
        console.warn(`[nous:desktop] ollama health check failed (${ollamaHealthFailures}/${OLLAMA_HEALTH_FAILURE_THRESHOLD})`)

        if (ollamaHealthFailures < OLLAMA_HEALTH_FAILURE_THRESHOLD) {
          return
        }

        if (!isOllamaManaged) {
          clearOllamaHealthMonitor()
          setOllamaStatus(detected)
          return
        }

        clearOllamaHealthMonitor()
        setOllamaState('error', {
          error: 'Ollama failed three consecutive health checks.',
        })

        const child = ollamaChild
        if (child) {
          ollamaSuppressRestartOnExit = true
          void terminateManagedOllamaProcess(child).finally(() => {
            scheduleOllamaRestart('health check failures')
          })
          return
        }

        scheduleOllamaRestart('health check failures')
      })
      .catch((err) => {
        ollamaHealthFailures += 1
        console.warn(`[nous:desktop] ollama health check error (${ollamaHealthFailures}/${OLLAMA_HEALTH_FAILURE_THRESHOLD}):`, err)

        if (ollamaHealthFailures >= OLLAMA_HEALTH_FAILURE_THRESHOLD) {
          clearOllamaHealthMonitor()
          setOllamaState('error', {
            error: err instanceof Error ? err.message : 'Ollama health check failed.',
          })
          scheduleOllamaRestart('health check errors')
        }
      })
      .finally(() => {
        ollamaHealthCheckInFlight = false
      })
  }, OLLAMA_HEALTH_INTERVAL_MS)
}

async function startOllama(): Promise<OllamaStatus> {
  if (ollamaStartPromise) {
    return ollamaStartPromise
  }

  ollamaStartPromise = (async () => {
    clearOllamaRestartTimer()

    if (ollamaStopPromise) {
      await ollamaStopPromise
    }

    const detected = await detectOllama()
    if (detected.state === 'running') {
      isOllamaManaged = false
      ollamaRestartCount = 0
      setOllamaStatus(detected)
      startOllamaHealthMonitor()
      return detected
    }

    const binary = await resolveOllamaBinary()
    if (!binary.found || !binary.command) {
      isOllamaManaged = false
      ollamaChild = null
      return setOllamaState('not_installed')
    }

    setOllamaState('starting')

    let child: ChildProcess
    try {
      child = spawn(binary.command, ['serve'], {
        shell: false,
        stdio: 'ignore',
        detached: false,
        windowsHide: true,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: undefined,
        },
      })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      setOllamaState('error', { error })
      scheduleOllamaRestart('spawn failure')
      return ollamaStatus
    }

    console.log(`[nous:desktop] ollama process started (pid=${child.pid ?? 'n/a'})`)
    ollamaChild = child
    isOllamaManaged = true
    ollamaSuppressRestartOnExit = false
    attachOllamaProcessListeners(child)

    try {
      const readyStatus = await waitForOllamaReady()
      ollamaHealthFailures = 0
      setOllamaStatus(readyStatus)
      startOllamaHealthMonitor()
      return readyStatus
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      setOllamaState('error', { error })

      if (ollamaChild === child) {
        ollamaSuppressRestartOnExit = true
        await terminateManagedOllamaProcess(child).catch(() => undefined)
      }

      if (!ollamaRestartTimer) {
        scheduleOllamaRestart('startup readiness timeout')
      }

      return ollamaStatus
    }
  })().finally(() => {
    ollamaStartPromise = null
  })

  return ollamaStartPromise
}

async function stopOllama(): Promise<void> {
  if (ollamaStopPromise) {
    return ollamaStopPromise
  }

  ollamaStopPromise = (async () => {
    clearOllamaRestartTimer()
    clearOllamaHealthMonitor()

    if (!isOllamaManaged || !ollamaChild) {
      isOllamaManaged = false
      const detected = await detectOllama()
      setOllamaStatus(detected)
      return
    }

    const child = ollamaChild
    setOllamaState('stopping')
    ollamaSuppressRestartOnExit = true
    await terminateManagedOllamaProcess(child)

    isOllamaManaged = false
    setOllamaState('installed_stopped')
  })().finally(() => {
    ollamaStopPromise = null
  })

  return ollamaStopPromise
}

async function handleBackendOllamaRequest(
  message: BackendOllamaRequestMessage,
): Promise<BackendOllamaResponseMessage> {
  try {
    if (message.action === 'getStatus') {
      return {
        type: 'ollama:response',
        requestId: message.requestId,
        ok: true,
        data: await refreshOllamaStatus(),
      }
    }

    if (message.action === 'start') {
      const status = await startOllama()
      return {
        type: 'ollama:response',
        requestId: message.requestId,
        ok: true,
        data: {
          success: status.state === 'running',
          error: status.state === 'running' ? undefined : status.error ?? `Ollama is ${status.state}.`,
        },
      }
    }

    await stopOllama()
    return {
      type: 'ollama:response',
      requestId: message.requestId,
      ok: true,
      data: { success: true },
    }
  } catch (err) {
    return {
      type: 'ollama:response',
      requestId: message.requestId,
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown Ollama request error.',
    }
  }
}

/**
 * Find a free port by binding to port 0 and reading the assigned port.
 * DO NOT REMOVE — see fix/desktop-backend-wiring
 */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (typeof addr === 'object' && addr !== null) {
        const port = addr.port
        srv.close(() => resolve(port))
      } else {
        srv.close(() => reject(new Error('Could not determine port')))
      }
    })
    srv.on('error', reject)
  })
}

/**
 * Resolve the path to the desktop backend server entry point.
 * In development, it's the TypeScript source (run via tsx/ts-node).
 * In production, it's the bundled JS in the output directory.
 */
function resolveServerEntryPath(): string {
  if (process.env['NODE_ENV'] === 'development') {
    // In dev, the server source is at desktop/server/main.ts relative to the package
    return join(__dirname, '../../server/main.ts')
  }
  // In production, the server is bundled alongside the main process output
  return join(__dirname, '../server/main.js')
}

/**
 * Spawn the backend server as a child process on the given port.
 * Returns a promise that resolves when the child signals readiness.
 * DO NOT REMOVE — see fix/desktop-backend-wiring
 */
function spawnBackendServer(port: number): Promise<number> {
  // Discard stale tRPC client so it gets recreated with the new port
  trpcClient = null

  return new Promise((resolve, reject) => {
    const serverPath = resolveServerEntryPath()
    const args = [`--port=${port}`]

    // Set data dir to app's userData directory for production isolation
    const dataDir = app.getPath('userData')
    args.push(`--data-dir=${join(dataDir, 'data')}`)

    console.log(`[nous:desktop] spawning backend server: ${serverPath} ${args.join(' ')}`)

    const isDev = process.env['NODE_ENV'] === 'development'

    // Use system Node.js (not Electron's embedded Node) to avoid native module
    // version mismatches (better-sqlite3 compiled for system Node, not Electron).
    // fork() with explicit execPath uses system node while preserving IPC channel.
    // Use 'node' from PATH — fork with execPath bypasses Electron's embedded Node
    const systemNode = 'node'

    let child: ChildProcess
    if (isDev) {
      child = fork(serverPath, args, {
        stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
        execPath: systemNode,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          ELECTRON_RUN_AS_NODE: undefined,
        },
        execArgv: ['--import', 'tsx'],
      })
    } else {
      child = fork(serverPath, args, {
        stdio: ['pipe', 'inherit', 'inherit', 'ipc'],
        execPath: systemNode,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          ELECTRON_RUN_AS_NODE: undefined,
        },
      })
    }

    backendChild = child

    const timeout = setTimeout(() => {
      reject(new Error('Backend server did not signal readiness within 30 seconds'))
    }, 30_000)

    child.on('message', (msg: unknown) => {
      if (typeof msg === 'object' && msg !== null && (msg as any).type === 'ready') {
        clearTimeout(timeout)
        backendPort = (msg as any).port ?? port
        backendReady = true
        console.log(`[nous:desktop] backend server ready on port ${backendPort}`)
        resolve(backendPort!)
        return
      }

      if (isBackendOllamaRequestMessage(msg)) {
        void handleBackendOllamaRequest(msg).then((response) => {
          child.send?.(response)
        })
      }
    })

    child.on('error', (err) => {
      clearTimeout(timeout)
      console.error('[nous:desktop] backend server error:', err)
      reject(err)
    })

    child.on('exit', (code, signal) => {
      clearTimeout(timeout)
      console.log(`[nous:desktop] backend server exited (code=${code}, signal=${signal})`)
      backendChild = null
      backendReady = false
      backendReadyPromise = null
      backendPort = null

      // Auto-restart if the app is still running and it wasn't a clean shutdown
      if (!isAppQuitting && code !== 0) {
        console.log('[nous:desktop] scheduling backend restart...')
        setTimeout(() => {
          if (!isAppQuitting) {
            startBackend().catch((err) => {
              console.error('[nous:desktop] backend restart failed:', err)
            })
          }
        }, 2000)
      }
    })
  })
}

/**
 * Start the backend: find a port, spawn, wait for ready.
 * DO NOT REMOVE — see fix/desktop-backend-wiring
 */
async function startBackend(): Promise<number> {
  const port = await findFreePort()
  backendReadyPromise = spawnBackendServer(port)
  return backendReadyPromise
}

/**
 * Stop the backend child process gracefully.
 * DO NOT REMOVE — see fix/desktop-backend-wiring
 */
async function stopBackend(): Promise<void> {
  if (!backendChild) {
    return
  }

  const child = backendChild
  console.log('[nous:desktop] stopping backend server...')

  const exitPromise = new Promise<void>((resolve) => {
    const onExit = () => {
      console.log('[nous:desktop] backend server stopped')
      resolve()
    }

    child.once('exit', onExit)

    try {
      child.kill('SIGTERM')
    } catch {
      child.off('exit', onExit)
      resolve()
      return
    }

    const forceKillTimer = setTimeout(() => {
      if (backendChild === child) {
        try {
          child.kill('SIGKILL')
        } catch {
          // Ignore force-kill failures during shutdown cleanup.
        }
      }
    }, BACKEND_STOP_TIMEOUT_MS)
    forceKillTimer.unref()
    child.once('exit', () => clearTimeout(forceKillTimer))
  })

  await exitPromise
}

async function performShutdownCleanup(): Promise<void> {
  console.log('[nous:desktop] shutdown: cleanup starting...')

  const results = await Promise.allSettled([
    stopOllama(),
    stopBackend(),
  ])

  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      continue
    }

    const target = index === 0 ? 'ollama' : 'backend'
    console.error(`[nous:desktop] failed to stop ${target} during shutdown:`, result.reason)
  }

  console.log('[nous:desktop] shutdown: cleanup complete')
}

// ━━━ Types ━━━

type JsonRecord = Record<string, unknown>

interface UsageWindowSnapshot {
  usedPercent: number | null
  windowMinutes: number | null
  resetsAt: string | null
}

interface DesktopProviderConfigEntry {
  id: string
  name?: string
  modelId?: string
}

interface RoleAssignmentDisplayEntry {
  role: string
  providerId: string | null
  displayName?: string | null
  modelSpec?: string | null
}

function isDesktopProviderConfigEntry(value: unknown): value is DesktopProviderConfigEntry {
  return typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
}

function buildRoleAssignmentDisplayEntries(
  assignments: Record<string, { providerId: string } | null>,
  providers: unknown,
): RoleAssignmentDisplayEntry[] {
  const providersById = new Map(
    Array.isArray(providers)
      ? providers
          .filter(isDesktopProviderConfigEntry)
          .map((provider) => [provider.id, provider] as const)
      : [],
  )

  return Object.entries(assignments).map(([role, assignment]) => {
    const providerId = assignment?.providerId ?? null
    const provider = providerId ? providersById.get(providerId) : undefined
    const modelSpec = provider?.name && provider?.modelId
      ? `${provider.name}:${provider.modelId}`
      : null

    return {
      role,
      providerId,
      ...(provider?.modelId ? { displayName: provider.modelId } : {}),
      ...(modelSpec ? { modelSpec } : {}),
    }
  })
}

interface ProviderUsageSnapshot {
  primary: UsageWindowSnapshot | null
  secondary: UsageWindowSnapshot | null
  tertiary: UsageWindowSnapshot | null
  updatedAt: string | null
  accountEmail: string | null
  accountOrganization: string | null
  loginMethod: string | null
}

interface ProviderStatusSnapshot {
  indicator: string
  description: string | null
  updatedAt: string | null
  url: string | null
}

interface ProviderUsageEntry {
  provider: string
  displayName: string
  sourceLabel: string | null
  usage: ProviderUsageSnapshot | null
  creditsRemaining: number | null
  codeReviewRemainingPercent: number | null
  extraUsageUsedUsd: number | null
  extraUsageLimitUsd: number | null
  todayCostUsd: number | null
  todayTokens: number | null
  last30DaysCostUsd: number | null
  last30DaysTokens: number | null
  status: ProviderStatusSnapshot | null
  errors: string[]
}

interface DesktopUsageSnapshot {
  generatedAt: string
  source: 'codexbar-cli' | 'fallback'
  warning?: string
  providers: ProviderUsageEntry[]
}

interface WebHostAppPanel {
  app_id: string
  panel_id: string
  label: string
  route_path: string
  dockview_panel_id: string
  config_version: string
  preserve_state: boolean
  position?: 'left' | 'right' | 'bottom' | 'main'
  config_snapshot: Record<string, {
    value: unknown
    source: 'manifest_default' | 'project_config' | 'system'
  }>
}

interface DesktopAppPanel extends WebHostAppPanel {
  src: string
}

// ━━━ Utility Functions ━━━

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude',
  cursor: 'Cursor',
  opencode: 'OpenCode',
  factory: 'Factory',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  copilot: 'Copilot',
  zai: 'z.ai',
  minimax: 'MiniMax',
  kimi: 'Kimi',
  kimik2: 'Kimi K2',
  kiro: 'Kiro',
  vertexai: 'Vertex AI',
  augment: 'Augment',
  jetbrains: 'JetBrains AI',
  amp: 'Amp',
  ollama: 'Ollama',
  synthetic: 'Synthetic',
  warp: 'Warp',
  openrouter: 'OpenRouter',
}

function getBackendBaseUrl(): string {
  if (backendPort) return `http://127.0.0.1:${backendPort}`
  throw new Error('Backend server is not ready')
}

function buildBackendUrl(pathname: string): string {
  return new URL(pathname, getBackendBaseUrl()).toString()
}

function asRecord(value: unknown): JsonRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as JsonRecord
}

function pickString(record: JsonRecord | null, ...keys: string[]): string | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

function pickNumber(record: JsonRecord | null, ...keys: string[]): number | null {
  if (!record) return null
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return null
}

function parseWindow(value: unknown): UsageWindowSnapshot | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    usedPercent: pickNumber(record, 'usedPercent', 'used_percent'),
    windowMinutes: pickNumber(record, 'windowMinutes', 'window_minutes'),
    resetsAt: pickString(record, 'resetsAt', 'resets_at'),
  }
}

function parseUsage(value: unknown): ProviderUsageSnapshot | null {
  const record = asRecord(value)
  if (!record) return null
  const identity = asRecord(record['identity'])
  return {
    primary: parseWindow(record['primary']),
    secondary: parseWindow(record['secondary']),
    tertiary: parseWindow(record['tertiary'] ?? record['model_specific']),
    updatedAt: pickString(record, 'updatedAt', 'updated_at'),
    accountEmail: pickString(record, 'accountEmail', 'account_email') ??
      pickString(identity, 'accountEmail', 'account_email'),
    accountOrganization: pickString(record, 'accountOrganization', 'account_organization') ??
      pickString(identity, 'accountOrganization', 'account_organization'),
    loginMethod: pickString(record, 'loginMethod', 'login_method') ??
      pickString(identity, 'loginMethod', 'login_method'),
  }
}

function parseStatus(value: unknown): ProviderStatusSnapshot | null {
  const record = asRecord(value)
  if (!record) return null
  return {
    indicator: (pickString(record, 'indicator') ?? 'unknown').toLowerCase(),
    description: pickString(record, 'description'),
    updatedAt: pickString(record, 'updatedAt', 'updated_at'),
    url: pickString(record, 'url'),
  }
}

function parseErrors(record: JsonRecord): string[] {
  const list: string[] = []
  const directError = record['error']
  if (typeof directError === 'string' && directError.length > 0) {
    list.push(directError)
  }
  const errors = record['errors']
  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (typeof entry === 'string' && entry.length > 0) list.push(entry)
    }
  }
  return list
}

function providerDisplayName(providerId: string): string {
  const normalized = providerId.toLowerCase()
  return PROVIDER_DISPLAY_NAMES[normalized] ?? providerId
}

function parseProviderEntry(value: unknown): ProviderUsageEntry | null {
  const record = asRecord(value)
  if (!record) return null

  const providerId = (pickString(record, 'provider', 'id') ?? 'unknown').toLowerCase()
  const displayName = pickString(record, 'displayName', 'display_name') ?? providerDisplayName(providerId)
  const usage = parseUsage(record['usage'])
  const status = parseStatus(record['status'])
  const credits = asRecord(record['credits'])
  const cost = asRecord(record['cost'])
  const tokenUsage = asRecord(
    record['tokenUsage'] ??
      record['token_usage'] ??
      record['totals']
  )
  const dashboard = asRecord(record['openaiDashboard'] ?? record['openAIDashboard'])

  const entry: ProviderUsageEntry = {
    provider: providerId,
    displayName,
    sourceLabel: pickString(record, 'sourceLabel', 'source'),
    usage,
    creditsRemaining: pickNumber(credits, 'remaining') ??
      pickNumber(record, 'creditsRemaining', 'credits_remaining'),
    codeReviewRemainingPercent: pickNumber(dashboard, 'codeReviewRemainingPercent', 'code_review_remaining_percent'),
    extraUsageUsedUsd: pickNumber(cost, 'used', 'sessionCostUSD', 'session_cost_usd') ??
      pickNumber(record, 'extraUsageUsedUsd', 'extra_usage_used_usd'),
    extraUsageLimitUsd: pickNumber(cost, 'limit', 'sessionLimitUSD', 'session_limit_usd') ??
      pickNumber(record, 'extraUsageLimitUsd', 'extra_usage_limit_usd'),
    todayCostUsd: pickNumber(tokenUsage, 'sessionCostUSD', 'session_cost_usd', 'todayCostUSD', 'today_cost_usd') ??
      pickNumber(record, 'todayCostUsd', 'today_cost_usd', 'sessionCostUSD', 'session_cost_usd'),
    todayTokens: pickNumber(tokenUsage, 'sessionTokens', 'session_tokens', 'todayTokens', 'today_tokens') ??
      pickNumber(record, 'todayTokens', 'today_tokens', 'sessionTokens', 'session_tokens'),
    last30DaysCostUsd: pickNumber(tokenUsage, 'last30DaysCostUSD', 'last30_days_cost_usd', 'monthCostUSD', 'month_cost_usd') ??
      pickNumber(record, 'last30DaysCostUsd', 'last30_days_cost_usd', 'monthCostUSD', 'month_cost_usd'),
    last30DaysTokens: pickNumber(tokenUsage, 'last30DaysTokens', 'last30_days_tokens', 'monthTokens', 'month_tokens') ??
      pickNumber(record, 'last30DaysTokens', 'last30_days_tokens', 'monthTokens', 'month_tokens'),
    status,
    errors: parseErrors(record),
  }

  return entry
}

function ensureText(value: string | Buffer): string {
  return typeof value === 'string' ? value : value.toString('utf8')
}

function extractJsonPayload(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed

  const firstObject = trimmed.indexOf('{')
  const firstArray = trimmed.indexOf('[')
  let startIndex = -1
  let closingChar = '}'

  if (firstObject >= 0 && firstArray >= 0) {
    if (firstObject < firstArray) {
      startIndex = firstObject
      closingChar = '}'
    } else {
      startIndex = firstArray
      closingChar = ']'
    }
  } else if (firstObject >= 0) {
    startIndex = firstObject
    closingChar = '}'
  } else if (firstArray >= 0) {
    startIndex = firstArray
    closingChar = ']'
  }

  if (startIndex < 0) return null
  const endIndex = trimmed.lastIndexOf(closingChar)
  if (endIndex <= startIndex) return null
  return trimmed.slice(startIndex, endIndex + 1)
}

function parseCodexBarProviders(raw: string): ProviderUsageEntry[] {
  const payload = extractJsonPayload(raw)
  if (!payload) return []

  try {
    const decoded: unknown = JSON.parse(payload)
    const entries = Array.isArray(decoded) ? decoded : [decoded]
    return entries
      .map(parseProviderEntry)
      .filter((entry): entry is ProviderUsageEntry => entry !== null)
  } catch {
    return []
  }
}

function fallbackUsageSnapshot(reason: string): DesktopUsageSnapshot {
  const now = Date.now()
  const inHours = (hours: number) => new Date(now + hours * 60 * 60 * 1000).toISOString()
  const inDays = (days: number) => new Date(now + days * 24 * 60 * 60 * 1000).toISOString()

  return {
    generatedAt: new Date().toISOString(),
    source: 'fallback',
    warning: reason,
    providers: [
      {
        provider: 'codex',
        displayName: 'Codex',
        sourceLabel: 'demo',
        usage: {
          primary: { usedPercent: 34, windowMinutes: 300, resetsAt: inHours(2) },
          secondary: { usedPercent: 57, windowMinutes: 10080, resetsAt: inDays(4) },
          tertiary: null,
          updatedAt: new Date().toISOString(),
          accountEmail: null,
          accountOrganization: null,
          loginMethod: 'Plus',
        },
        creditsRemaining: 74.2,
        codeReviewRemainingPercent: 100,
        extraUsageUsedUsd: 0,
        extraUsageLimitUsd: 2000,
        todayCostUsd: 0.04,
        todayTokens: 15000,
        last30DaysCostUsd: 254.24,
        last30DaysTokens: 218000000,
        status: { indicator: 'none', description: 'Operational', updatedAt: new Date().toISOString(), url: 'https://status.openai.com' },
        errors: [],
      },
      {
        provider: 'claude',
        displayName: 'Claude',
        sourceLabel: 'demo',
        usage: {
          primary: { usedPercent: 22, windowMinutes: 300, resetsAt: inHours(1.5) },
          secondary: { usedPercent: 63, windowMinutes: 10080, resetsAt: inDays(3) },
          tertiary: { usedPercent: 71, windowMinutes: 10080, resetsAt: inDays(3) },
          updatedAt: new Date().toISOString(),
          accountEmail: null,
          accountOrganization: null,
          loginMethod: 'Pro',
        },
        creditsRemaining: null,
        codeReviewRemainingPercent: null,
        extraUsageUsedUsd: 0,
        extraUsageLimitUsd: 2000,
        todayCostUsd: 0.01,
        todayTokens: 6500,
        last30DaysCostUsd: 89.52,
        last30DaysTokens: 72000000,
        status: { indicator: 'none', description: 'Operational', updatedAt: new Date().toISOString(), url: 'https://status.anthropic.com' },
        errors: [],
      },
      {
        provider: 'cursor',
        displayName: 'Cursor',
        sourceLabel: 'demo',
        usage: {
          primary: { usedPercent: 76, windowMinutes: 43200, resetsAt: inDays(18) },
          secondary: null,
          tertiary: null,
          updatedAt: new Date().toISOString(),
          accountEmail: null,
          accountOrganization: null,
          loginMethod: null,
        },
        creditsRemaining: null,
        codeReviewRemainingPercent: null,
        extraUsageUsedUsd: null,
        extraUsageLimitUsd: null,
        todayCostUsd: null,
        todayTokens: null,
        last30DaysCostUsd: null,
        last30DaysTokens: null,
        status: { indicator: 'minor', description: 'Minor incident', updatedAt: new Date().toISOString(), url: 'https://status.cursor.com' },
        errors: [],
      },
    ],
  }
}

async function runCodexBar(args: string[]): Promise<ProviderUsageEntry[] | null> {
  try {
    const result = await execFileAsync('codexbar', args, {
      encoding: 'utf8',
      timeout: 12_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    })
    const providers = parseCodexBarProviders(ensureText(result.stdout))
    return providers.length > 0 ? providers : null
  } catch {
    return null
  }
}

async function loadUsageSnapshot(): Promise<DesktopUsageSnapshot> {
  const attempts: string[][] = [
    ['usage', '--format', 'json', '--provider', 'all', '--status'],
    ['usage', '--format', 'json', '--provider', 'all'],
    ['--format', 'json', '--provider', 'all', '--status'],
    ['--format', 'json', '--provider', 'all'],
  ]

  for (const args of attempts) {
    const providers = await runCodexBar(args)
    if (providers) {
      return {
        generatedAt: new Date().toISOString(),
        source: 'codexbar-cli',
        providers,
      }
    }
  }

  return fallbackUsageSnapshot(
    'codexbar CLI unavailable or returned unparseable JSON. Install CodexBar CLI to enable live usage data.'
  )
}

// ━━━ IPC Handlers ━━━

// IPC handlers registered once — before any window is created
ipcMain.handle('layout:get', () => {
  const stored = store.get('layoutStore')
  return stored?.layout ?? null
})

ipcMain.handle('layout:set', (_event, layout: unknown) => {
  store.set('layoutStore', {
    version: 1,
    layout,
    savedAt: new Date().toISOString(),
  } satisfies StoredLayout)
})

// Filesystem handlers — implemented in ui/phase-1.4
ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: dirPath.replace(/\\/g, '/') + '/' + e.name,
    }))
  } catch {
    return []
  }
})

ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return content
  } catch {
    return null
  }
})

ipcMain.handle('usage:getSnapshot', async () => loadUsageSnapshot())

// Window control handlers — used by the custom frameless titlebar
ipcMain.handle('win:minimize',         () => win?.minimize())
ipcMain.handle('win:maximize',         () => {
  if (!win) return
  if (win.isMaximized()) {
    win.unmaximize()
    return
  }
  win.maximize()
})
ipcMain.handle('win:close',            () => win?.close())
ipcMain.handle('win:isMaximized',      () => win?.isMaximized() ?? false)
ipcMain.handle('win:toggleDevTools',   () => win?.webContents.toggleDevTools())
ipcMain.handle('win:toggleFullScreen', () => win?.setFullScreen(!win?.isFullScreen()))
ipcMain.handle('win:isFullScreen',     () => win?.isFullScreen() ?? false)
ipcMain.handle('app:quit',             () => app.quit())
ipcMain.handle('app:newWindow',        () => createWindow())

// Backend status — lets the renderer know if the backend is ready
ipcMain.handle('backend:getStatus', () => ({
  ready: backendReady,
  port: backendPort,
  trpcUrl: backendPort ? `http://127.0.0.1:${backendPort}/api/trpc` : null,
}))

// Ollama status — retained for backward compatibility with older renderer code.
/** @deprecated Use ollama:getStatus instead. */
ipcMain.handle('backend:getOllamaStatus', async () => {
  try {
    return await refreshOllamaStatus()
  } catch {
    return ollamaStatus
  }
})

ipcMain.handle('ollama:getStatus', async () => {
  try {
    return await refreshOllamaStatus()
  } catch {
    return ollamaStatus
  }
})

ipcMain.handle('ollama:start', async () => {
  const status = await startOllama()
  if (status.state === 'running') {
    return { success: true }
  }

  return {
    success: false,
    error: status.error ?? `Ollama is ${status.state}.`,
  }
})

ipcMain.handle('ollama:stop', async () => {
  if (ollamaState === 'running' && !isOllamaManaged) {
    return {
      success: false,
      error: 'Ollama is already running under an external process and will not be stopped by the desktop app.',
    }
  }

  await stopOllama()
  return { success: true }
})

ipcMain.handle('ollama:pullModel', async (_event, modelId: string) => {
  if (activeOllamaPull) {
    throw new Error('An Ollama model pull is already in progress.')
  }

  activeOllamaPull = pullOllamaModel(modelId, {
    onProgress: (progress: OllamaModelPullProgress) => {
      win?.webContents.send('ollama:pullProgress', progress)
    },
  })
    .then(async () => {
      await refreshOllamaStatus().catch(() => undefined)
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : 'Ollama model pull failed.'
      win?.webContents.send('ollama:pullProgress', { status: message })
    })
    .finally(() => {
      activeOllamaPull = null
    })
})

// Chat handlers — tRPC proxy to the self-hosted backend
// Lazy tRPC client — created once the backend is ready
let trpcClient: ReturnType<typeof createTRPCClient> | null = null

function getTrpcClient() {
  if (!trpcClient && backendPort) {
    trpcClient = createTRPCClient({
      links: [httpBatchLink({
        url: `http://127.0.0.1:${backendPort}/api/trpc`,
        transformer: superjson,
      })],
    })
  }
  if (!trpcClient) {
    throw new Error('Backend server is not ready — tRPC client unavailable')
  }
  return trpcClient
}

/**
 * Ensure the backend is ready before making tRPC calls.
 * Waits for the backend ready promise if it's still starting.
 */
async function ensureBackendReady(): Promise<void> {
  if (backendReady) return
  if (backendReadyPromise) {
    await backendReadyPromise
    return
  }
  throw new Error('Backend server is not running')
}

function buildHardwareFallback(): HardwareSpec {
  return {
    totalMemoryMB: 0,
    availableMemoryMB: 0,
    cpuCores: 0,
    cpuModel: 'Unknown CPU',
    platform: process.platform,
    arch: process.arch,
    gpu: {
      detected: false,
    },
  }
}

function buildRecommendationFallback(): RecommendationResult {
  return {
    singleModel: null,
    multiModel: [],
    hardwareSpec: buildHardwareFallback(),
    profileName: 'local-only',
    advisory: 'Hardware recommendations are unavailable while the backend is starting.',
  }
}

function buildFirstRunActionFailure(error = 'Backend unavailable'): FirstRunActionResult {
  return {
    success: false,
    state: createDefaultFirstRunState(),
    error,
  }
}

const chatHistory: { role: string; content: string; timestamp: string }[] = []

ipcMain.handle('chat:send', async (_event, message: string) => {
  chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() })
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    const result = await client.chat.sendMessage.mutate({ message })
    chatHistory.push({ role: 'assistant', content: result.response, timestamp: new Date().toISOString() })
    return { response: result.response, traceId: result.traceId }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    const response = `[Starting...] Nous backend is initializing. Please try again in a moment. (${errorMessage})`
    chatHistory.push({ role: 'assistant', content: response, timestamp: new Date().toISOString() })
    return { response, traceId: 'starting-' + Date.now() }
  }
})

ipcMain.handle('chat:getHistory', () => chatHistory)

// MAO handlers — tRPC proxy to backend server with stub fallback
ipcMain.handle('mao:getAgentProjections', async (_event, projectId: string) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.mao.getAgentProjections.query({ projectId })
  } catch {
    return []
  }
})

ipcMain.handle('mao:getProjectControlProjection', async (_event, projectId: string) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.mao.getProjectControlProjection.query({ projectId })
  } catch {
    return null
  }
})

ipcMain.handle('mao:getProjectSnapshot', async (_event, input: unknown) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.mao.getProjectSnapshot.query(input)
  } catch {
    return null
  }
})

ipcMain.handle('mao:requestProjectControl', async (_event, input: unknown) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.mao.requestProjectControl.mutate(input)
  } catch {
    return null
  }
})

// Preferences handlers — tRPC proxy
ipcMain.handle('preferences:getApiKeys', async () => {
  try { await ensureBackendReady(); const c = getTrpcClient() as any; return await c.preferences.getApiKeys.query() } catch { return [] }
})
ipcMain.handle('preferences:setApiKey', async (_event, input: unknown) => {
  try { await ensureBackendReady(); const c = getTrpcClient() as any; return await c.preferences.setApiKey.mutate(input) } catch { return { stored: false } }
})
ipcMain.handle('preferences:deleteApiKey', async (_event, input: unknown) => {
  try { await ensureBackendReady(); const c = getTrpcClient() as any; return await c.preferences.deleteApiKey.mutate(input) } catch { return { deleted: false } }
})
ipcMain.handle('preferences:testApiKey', async (_event, input: unknown) => {
  try { await ensureBackendReady(); const c = getTrpcClient() as any; return await c.preferences.testApiKey.mutate(input) } catch { return { valid: false, error: 'Backend unavailable' } }
})
ipcMain.handle('preferences:getSystemStatus', async () => {
  try { await ensureBackendReady(); const c = getTrpcClient() as any; return await c.preferences.getSystemStatus.query() } catch { return { ollama: { running: false, models: [] }, configuredProviders: [], credentialVaultHealthy: false } }
})
ipcMain.handle('preferences:getAvailableModels', async () => {
  try { await ensureBackendReady(); const c = getTrpcClient() as any; return await c.preferences.getAvailableModels.query() } catch { return { models: [] } }
})
ipcMain.handle('preferences:getModelSelection', async () => {
  try { await ensureBackendReady(); const c = getTrpcClient() as any; return await c.preferences.getModelSelection.query() } catch { return { principal: null, system: null } }
})
ipcMain.handle('preferences:setModelSelection', async (_event, input: unknown) => {
  try { await ensureBackendReady(); const c = getTrpcClient() as any; return await c.preferences.setModelSelection.mutate(input) } catch { return { success: false } }
})
ipcMain.handle('preferences:getRoleAssignments', async (): Promise<RoleAssignmentDisplayEntry[]> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    const [assignments, config] = await Promise.all([
      client.preferences.getRoleAssignments.query(),
      client.config.get.query(),
    ])

    return buildRoleAssignmentDisplayEntries(
      assignments as Record<string, { providerId: string } | null>,
      (config as JsonRecord | null | undefined)?.['providers'],
    )
  } catch {
    return []
  }
})
ipcMain.handle('preferences:setRoleAssignment', async (_event, input: unknown) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.preferences.setRoleAssignment.mutate(input)
  } catch {
    return { success: false, error: 'Backend unavailable' }
  }
})
ipcMain.handle('hardware:getSpec', async (): Promise<HardwareSpec> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.hardware.getSpec.query()
  } catch {
    return buildHardwareFallback()
  }
})
ipcMain.handle('hardware:getRecommendations', async (): Promise<RecommendationResult> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.hardware.getRecommendations.query()
  } catch {
    return buildRecommendationFallback()
  }
})
ipcMain.handle('firstRun:getWizardState', async (): Promise<FirstRunState> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.firstRun.getWizardState.query()
  } catch {
    return createDefaultFirstRunState()
  }
})
ipcMain.handle('firstRun:checkPrerequisites', async (): Promise<FirstRunPrerequisites> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.firstRun.checkPrerequisites.query()
  } catch {
    return {
      ollama: {
        installed: false,
        running: false,
        state: 'not_installed',
        models: [],
        defaultModel: null,
      },
      hardware: buildHardwareFallback(),
      recommendations: buildRecommendationFallback(),
    }
  }
})
ipcMain.handle('firstRun:downloadModel', async (_event, input: { model: string }): Promise<FirstRunActionResult> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.firstRun.downloadModel.mutate(input)
  } catch {
    return buildFirstRunActionFailure()
  }
})
ipcMain.handle('firstRun:configureProvider', async (_event, input: { modelSpec: string }): Promise<FirstRunActionResult> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.firstRun.configureProvider.mutate(input)
  } catch {
    return buildFirstRunActionFailure()
  }
})
ipcMain.handle('firstRun:assignRoles', async (_event, input: { assignments: FirstRunRoleAssignmentInput[] }): Promise<FirstRunActionResult> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.firstRun.assignRoles.mutate(input)
  } catch {
    return buildFirstRunActionFailure()
  }
})
ipcMain.handle('firstRun:completeStep', async (_event, input: { step: FirstRunStep }): Promise<FirstRunState> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.firstRun.completeStep.mutate(input)
  } catch {
    return createDefaultFirstRunState()
  }
})
ipcMain.handle('firstRun:resetWizard', async (): Promise<FirstRunState> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.firstRun.resetWizard.mutate()
  } catch {
    return createDefaultFirstRunState()
  }
})

ipcMain.handle('app-install:prepare', async (_event, input: unknown) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.packages.prepareAppInstall.query(input)
  } catch {
    return { error: 'Backend unavailable' }
  }
})
ipcMain.handle('app-install:install', async (_event, input: unknown) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.packages.installApp.mutate(input)
  } catch {
    return { error: 'Backend unavailable' }
  }
})
ipcMain.handle('app-settings:prepare', async (_event, input: unknown) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.packages.prepareAppSettings.query(input)
  } catch {
    return { error: 'Backend unavailable' }
  }
})
ipcMain.handle('app-settings:save', async (_event, input: unknown) => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    return await client.packages.saveAppSettings.mutate(input)
  } catch {
    return { error: 'Backend unavailable' }
  }
})
ipcMain.handle('app-panels:list', async (): Promise<DesktopAppPanel[]> => {
  try {
    await ensureBackendReady()
    const client = getTrpcClient() as any
    const panels = await client.packages.listAppPanels.query()
    if (!Array.isArray(panels)) return []
    return panels.map((panel: WebHostAppPanel) => ({
      ...panel,
      src: buildBackendUrl(panel.route_path),
    }))
  } catch {
    return []
  }
})

// ━━━ Window Creation ━━━

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#1e1e1e',  // --nous-bg — flash-prevention; must match renderer
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env['NODE_ENV'] === 'development') {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] ?? 'http://localhost:5173')
    win.webContents.openDevTools()
    win.webContents.on('context-menu', (_e, params) => {
      win?.webContents.inspectElement(params.x, params.y)
    })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  emitOllamaStateChanged()
  win.on('closed', () => { win = null })
}

// ━━━ App Lifecycle ━━━

app.on('before-quit', (event) => {
  if (shutdownCleanupComplete) {
    return
  }

  event.preventDefault()

  if (isAppQuitting) {
    return
  }

  isAppQuitting = true
  let shutdownTimeout: ReturnType<typeof setTimeout> | null = null

  const timeoutPromise = new Promise<void>((resolve) => {
    shutdownTimeout = setTimeout(() => {
      console.warn(
        `[nous:desktop] shutdown: cleanup timed out after ${APP_SHUTDOWN_TIMEOUT_MS / 1000}s, force-quitting`,
      )
      resolve()
    }, APP_SHUTDOWN_TIMEOUT_MS)
    shutdownTimeout.unref()
  })

  void Promise.race([
    performShutdownCleanup(),
    timeoutPromise,
  ]).finally(() => {
    if (shutdownTimeout) {
      clearTimeout(shutdownTimeout)
    }
    shutdownCleanupComplete = true
    app.quit()
  })
})

app.whenReady().then(async () => {
  // Start the backend server before creating the window
  try {
    await startBackend()
    console.log('[nous:desktop] backend started, creating window...')
  } catch (err) {
    console.error('[nous:desktop] failed to start backend:', err)
    // Still create the window — the UI will show "Starting..." messages
  }

  void startOllama().catch((err) => {
    console.error('[nous:desktop] failed to start ollama:', err)
  })
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
