import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())
const appEventHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>())
const browserWindows = vi.hoisted(() => [] as MockBrowserWindow[])
const createServerMock = vi.hoisted(() => vi.fn())
const execFileMock = vi.hoisted(() => vi.fn())
const forkMock = vi.hoisted(() => vi.fn())
const spawnMock = vi.hoisted(() => vi.fn())
const detectOllamaMock = vi.hoisted(() => vi.fn())
const resolveOllamaBinaryMock = vi.hoisted(() => vi.fn())
const pullOllamaModelMock = vi.hoisted(() => vi.fn())
const createDefaultFirstRunStateMock = vi.hoisted(() =>
  vi.fn(() => ({
    currentStep: 'ollama_check',
    complete: false,
    steps: {
      ollama_check: { status: 'pending' },
      model_download: { status: 'pending' },
      provider_config: { status: 'pending' },
      role_assignment: { status: 'pending' },
    },
    lastUpdatedAt: '2026-03-22T00:00:00.000Z',
  }))
)

let nextPid = 7000

const runtimeState = {
  ollamaRunning: false,
}

class MockChildProcess extends EventEmitter {
  pid: number
  send = vi.fn()
  kill = vi.fn((_signal?: NodeJS.Signals) => true)

  constructor(pid: number) {
    super()
    this.pid = pid
  }
}

class MockBrowserWindow extends EventEmitter {
  webContents = {
    send: vi.fn(),
    openDevTools: vi.fn(),
    on: vi.fn(),
    toggleDevTools: vi.fn(),
    inspectElement: vi.fn(),
  }
  loadURL = vi.fn()
  loadFile = vi.fn()
  minimize = vi.fn()
  maximize = vi.fn()
  unmaximize = vi.fn()
  close = vi.fn(() => {
    this.emit('closed')
  })
  isMaximized = vi.fn(() => false)
  setFullScreen = vi.fn()
  isFullScreen = vi.fn(() => false)

  constructor() {
    super()
    browserWindows.push(this)
  }

  static getAllWindows(): MockBrowserWindow[] {
    return browserWindows
  }
}

const appMock = vi.hoisted(() => ({
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    appEventHandlers.set(event, handler)
  }),
  getPath: vi.fn(() => 'C:/Users/nous/AppData/Roaming/Nous'),
  quit: vi.fn(),
}))

const ipcMainMock = vi.hoisted(() => ({
  handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
    ipcHandlers.set(channel, handler)
  }),
}))

class MockStore {
  get = vi.fn()
  set = vi.fn()
}

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: MockBrowserWindow,
  ipcMain: ipcMainMock,
}))

vi.mock('electron-store', () => ({
  default: MockStore,
}))

vi.mock('@trpc/client', () => ({
  createTRPCClient: vi.fn(() => ({})),
  httpBatchLink: vi.fn(() => ({})),
}))

vi.mock('superjson', () => ({
  default: {},
}))

vi.mock('node:net', () => ({
  createServer: createServerMock,
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  fork: forkMock,
  spawn: spawnMock,
}))

vi.mock('../../shared-server/src/ollama-detection', () => ({
  detectOllama: detectOllamaMock,
  pullOllamaModel: pullOllamaModelMock,
  resolveOllamaBinary: resolveOllamaBinaryMock,
}))

vi.mock('../../shared-server/src/first-run', () => ({
  createDefaultFirstRunState: createDefaultFirstRunStateMock,
}))

function installDefaultMocks(): void {
  detectOllamaMock.mockImplementation(async () => {
    if (runtimeState.ollamaRunning) {
      return {
        installed: true,
        running: true,
        state: 'running',
        models: ['qwen2.5:7b'],
        defaultModel: 'qwen2.5:7b',
      }
    }

    return {
      installed: true,
      running: false,
      state: 'installed_stopped',
      models: [],
      defaultModel: null,
    }
  })

  resolveOllamaBinaryMock.mockResolvedValue({
    found: true,
    command: 'ollama',
    resolvedVia: 'path_lookup',
    platform: 'linux',
  })

  pullOllamaModelMock.mockResolvedValue(undefined)

  execFileMock.mockImplementation(
    (
      _command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      callback(null, '', '')
      return {} as never
    },
  )

  createServerMock.mockImplementation(() => ({
    listen: (_port: number, _host: string, callback: () => void) => {
      callback()
    },
    address: () => ({ port: 54321 }),
    close: (callback?: () => void) => {
      callback?.()
    },
    on: vi.fn(),
  }))

  forkMock.mockImplementation(() => {
    const child = new MockChildProcess(nextPid++)
    queueMicrotask(() => {
      child.emit('message', { type: 'ready', port: 54321 })
    })
    return child as any
  })

  spawnMock.mockImplementation(() => {
    runtimeState.ollamaRunning = true
    return new MockChildProcess(nextPid++) as any
  })
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function loadMainModule(): Promise<void> {
  await import('../src/main/index')
  await flushMicrotasks()
}

function getAppHandler<T extends (...args: any[]) => any>(event: string): T {
  const handler = appEventHandlers.get(event)
  if (!handler) {
    throw new Error(`App handler not registered: ${event}`)
  }
  return handler as T
}

function getBackendChild(): MockChildProcess {
  const child = forkMock.mock.results[0]?.value as MockChildProcess | undefined
  if (!child) {
    throw new Error('Backend child was not spawned')
  }
  return child
}

function getOllamaChild(): MockChildProcess {
  const child = spawnMock.mock.results[0]?.value as MockChildProcess | undefined
  if (!child) {
    throw new Error('Ollama child was not spawned')
  }
  return child
}

async function emitExit(
  child: MockChildProcess,
  code = 0,
  signal: NodeJS.Signals | null = 'SIGTERM',
): Promise<void> {
  runtimeState.ollamaRunning = spawnMock.mock.results[0]?.value === child
    ? false
    : runtimeState.ollamaRunning
  child.emit('exit', code, signal)
  await flushMicrotasks()
}

describe('desktop graceful shutdown', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
    vi.clearAllTimers()
    ipcHandlers.clear()
    appEventHandlers.clear()
    browserWindows.length = 0

    nextPid = 7000
    runtimeState.ollamaRunning = false

    appMock.whenReady.mockClear()
    appMock.on.mockClear()
    appMock.getPath.mockClear()
    appMock.quit.mockClear()
    ipcMainMock.handle.mockClear()
    createServerMock.mockReset()
    execFileMock.mockReset()
    forkMock.mockReset()
    spawnMock.mockReset()
    detectOllamaMock.mockReset()
    resolveOllamaBinaryMock.mockReset()
    pullOllamaModelMock.mockReset()
    createDefaultFirstRunStateMock.mockClear()

    installDefaultMocks()

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('awaits backend and Ollama cleanup before allowing quit to continue', async () => {
    await loadMainModule()

    const beforeQuit = getAppHandler<(event: { preventDefault: () => void }) => void>('before-quit')
    const backendChild = getBackendChild()
    const ollamaChild = getOllamaChild()
    const event = { preventDefault: vi.fn() }

    beforeQuit(event)
    await flushMicrotasks()

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(backendChild.kill).toHaveBeenCalledWith('SIGTERM')
    expect(appMock.quit).not.toHaveBeenCalled()

    await emitExit(backendChild)
    expect(appMock.quit).not.toHaveBeenCalled()

    await emitExit(ollamaChild)
    expect(backendChild.kill).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate cleanup while shutdown is already in progress', async () => {
    await loadMainModule()

    const beforeQuit = getAppHandler<(event: { preventDefault: () => void }) => void>('before-quit')
    const backendChild = getBackendChild()
    const ollamaChild = getOllamaChild()

    const firstEvent = { preventDefault: vi.fn() }
    beforeQuit(firstEvent)
    await flushMicrotasks()

    const secondEvent = { preventDefault: vi.fn() }
    beforeQuit(secondEvent)
    await flushMicrotasks()

    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(secondEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(backendChild.kill).toHaveBeenCalledTimes(1)
    expect(ollamaChild.kill).toHaveBeenCalledTimes(1)
  })

  it('forces the app to quit when shutdown cleanup exceeds the timeout window', async () => {
    await loadMainModule()

    const beforeQuit = getAppHandler<(event: { preventDefault: () => void }) => void>('before-quit')
    const event = { preventDefault: vi.fn() }

    beforeQuit(event)
    await flushMicrotasks()

    await vi.advanceTimersByTimeAsync(10_000)
    await flushMicrotasks()

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(appMock.quit).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      '[nous:desktop] shutdown: cleanup timed out after 10s, force-quitting',
    )
  })
})
