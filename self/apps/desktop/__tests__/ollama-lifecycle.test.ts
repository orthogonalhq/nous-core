import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
const appEventHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
const browserWindows = vi.hoisted(() => [] as MockBrowserWindow[]);
const webContentsSendMock = vi.hoisted(() => vi.fn());
const execFileMock = vi.hoisted(() => vi.fn());
const forkMock = vi.hoisted(() => vi.fn());
const spawnMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

const originalFetch = globalThis.fetch;
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');

const ollamaRuntime = {
  binaryAvailable: false,
  running: false,
  models: ['llama3.2:3b'],
  taskkillCalls: [] as string[][],
};

let nextPid = 4000;

class MockChildProcess extends EventEmitter {
  pid: number;
  send = vi.fn();
  kill = vi.fn((signal?: NodeJS.Signals) => {
    ollamaRuntime.running = false;
    this.emit('exit', signal === 'SIGKILL' ? 1 : 0, signal ?? null);
    return true;
  });

  constructor(pid: number) {
    super();
    this.pid = pid;
  }
}

class MockBrowserWindow extends EventEmitter {
  webContents = {
    send: webContentsSendMock,
    openDevTools: vi.fn(),
    on: vi.fn(),
    toggleDevTools: vi.fn(),
    inspectElement: vi.fn(),
  };
  loadURL = vi.fn();
  loadFile = vi.fn();
  minimize = vi.fn();
  maximize = vi.fn();
  unmaximize = vi.fn();
  close = vi.fn(() => {
    this.emit('closed');
  });
  isMaximized = vi.fn(() => false);
  setFullScreen = vi.fn();
  isFullScreen = vi.fn(() => false);

  constructor() {
    super();
    browserWindows.push(this);
  }

  static getAllWindows(): MockBrowserWindow[] {
    return browserWindows;
  }
}

const appMock = vi.hoisted(() => ({
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn((event: string, handler: (...args: any[]) => any) => {
    appEventHandlers.set(event, handler);
  }),
  getPath: vi.fn(() => 'C:/Users/nous/AppData/Roaming/Nous'),
  quit: vi.fn(),
}));

const ipcMainMock = vi.hoisted(() => ({
  handle: vi.fn((channel: string, handler: (...args: any[]) => any) => {
    ipcHandlers.set(channel, handler);
  }),
}));

class MockStore {
  get = vi.fn();
  set = vi.fn();
}

vi.mock('electron', () => ({
  app: appMock,
  BrowserWindow: MockBrowserWindow,
  ipcMain: ipcMainMock,
}));

vi.mock('electron-store', () => ({
  default: MockStore,
}));

vi.mock('@trpc/client', () => ({
  createTRPCClient: vi.fn(() => ({})),
  httpBatchLink: vi.fn(() => ({})),
}));

vi.mock('superjson', () => ({
  default: {},
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  fork: forkMock,
  spawn: spawnMock,
}));

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', {
    configurable: true,
    value: platform,
  });
}

function restorePlatform(): void {
  if (originalPlatformDescriptor) {
    Object.defineProperty(process, 'platform', originalPlatformDescriptor);
  }
}

function createConnectionError(): Error {
  const error = new Error('connect refused') as Error & {
    cause?: { code: string };
  };
  error.cause = { code: 'ECONNREFUSED' };
  return error;
}

function installDefaultMocks(): void {
  execFileMock.mockImplementation(
    (
      command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (command === 'taskkill') {
        ollamaRuntime.taskkillCalls.push(_args.map(String));
        callback(null, '', '');
        const latestChild = spawnMock.mock.results.at(-1)?.value as MockChildProcess | undefined;
        queueMicrotask(() => {
          ollamaRuntime.running = false;
          latestChild?.emit('exit', 0, null);
        });
        return {} as never;
      }

      if (
        command === 'ollama' ||
        command === '/usr/local/bin/ollama' ||
        command.endsWith('\\ollama.exe')
      ) {
        if (ollamaRuntime.binaryAvailable) {
          callback(null, 'ollama version 0.6.0', '');
          return {} as never;
        }

        callback(Object.assign(new Error('not found'), { code: 'ENOENT' }), '', '');
        return {} as never;
      }

      callback(Object.assign(new Error('not found'), { code: 'ENOENT' }), '', '');
      return {} as never;
    },
  );

  forkMock.mockImplementation(() => {
    const child = new MockChildProcess(nextPid++);
    queueMicrotask(() => {
      child.emit('message', { type: 'ready', port: 54321 });
    });
    return child as any;
  });

  spawnMock.mockImplementation((_command: string, _args: string[], _options: unknown) => {
    const child = new MockChildProcess(nextPid++);
    ollamaRuntime.running = true;
    return child as any;
  });

  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes('/api/tags')) {
      if (!ollamaRuntime.running) {
        throw createConnectionError();
      }

      return new Response(
        JSON.stringify({
          models: ollamaRuntime.models.map((name) => ({ name })),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );
    }

    if (url.includes('/api/pull')) {
      return new Response('{"status":"success"}\n', {
        status: 200,
        headers: {
          'Content-Type': 'application/x-ndjson',
        },
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

async function flushStartup(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function loadMainModule(): Promise<void> {
  await import('../src/main/index');
  await flushStartup();
}

function getHandler<T extends (...args: any[]) => any>(channel: string): T {
  const handler = ipcHandlers.get(channel);
  if (!handler) {
    throw new Error(`IPC handler not registered: ${channel}`);
  }
  return handler as T;
}

describe('desktop Ollama lifecycle', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllTimers();
    ipcHandlers.clear();
    appEventHandlers.clear();
    browserWindows.length = 0;
    webContentsSendMock.mockReset();
    execFileMock.mockReset();
    forkMock.mockReset();
    spawnMock.mockReset();
    fetchMock.mockReset();
    appMock.whenReady.mockClear();
    appMock.on.mockClear();
    appMock.getPath.mockClear();
    appMock.quit.mockClear();

    nextPid = 4000;
    ollamaRuntime.binaryAvailable = false;
    ollamaRuntime.running = false;
    ollamaRuntime.models = ['llama3.2:3b'];
    ollamaRuntime.taskkillCalls = [];

    restorePlatform();
    setPlatform('linux');
    installDefaultMocks();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    vi.clearAllTimers();
    restorePlatform();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('transitions through installed_stopped, starting, running, stopping, and back to installed_stopped', async () => {
    await loadMainModule();

    const getStatus = getHandler<() => Promise<{ state: string }>>('ollama:getStatus');
    const start = getHandler<() => Promise<{ success: boolean }>>('ollama:start');
    const stop = getHandler<() => Promise<{ success: boolean }>>('ollama:stop');

    await expect(getStatus()).resolves.toMatchObject({ state: 'not_installed' });

    ollamaRuntime.binaryAvailable = true;
    await expect(getStatus()).resolves.toMatchObject({ state: 'installed_stopped' });
    await expect(start()).resolves.toEqual({ success: true });
    await expect(getStatus()).resolves.toMatchObject({ state: 'running' });
    await expect(stop()).resolves.toEqual({ success: true });
    await expect(getStatus()).resolves.toMatchObject({ state: 'installed_stopped' });
    expect(spawnMock).toHaveBeenCalledWith(
      'ollama',
      ['serve'],
      expect.objectContaining({
        env: expect.objectContaining({
          ELECTRON_RUN_AS_NODE: undefined,
        }),
      }),
    );
  });

  it('detects an externally managed Ollama instance and does not spawn or stop it', async () => {
    ollamaRuntime.binaryAvailable = true;
    ollamaRuntime.running = true;

    await loadMainModule();

    const getStatus = getHandler<() => Promise<{ state: string }>>('ollama:getStatus');
    const stop = getHandler<() => Promise<{ success: boolean; error?: string }>>('ollama:stop');

    await expect(getStatus()).resolves.toMatchObject({ state: 'running' });
    expect(spawnMock).not.toHaveBeenCalled();
    await expect(stop()).resolves.toEqual({
      success: false,
      error: 'Ollama is already running under an external process and will not be stopped by the desktop app.',
    });
  });

  it('defines the exponential backoff schedule in the main-process source', () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf-8');

    expect(source).toContain('Math.min(2000 * 2 ** restartCount, 30_000)');
    expect(source).toContain('const OLLAMA_MAX_RESTARTS = 5');
    expect(source).toContain('ollama restart attempt');
  });

  it('restarts Ollama after three consecutive health-check failures', async () => {
    ollamaRuntime.binaryAvailable = true;

    await loadMainModule();
    const start = getHandler<() => Promise<{ success: boolean }>>('ollama:start');
    await expect(start()).resolves.toEqual({ success: true });

    const initialSpawnCount = spawnMock.mock.calls.length;

    ollamaRuntime.running = false;
    await vi.advanceTimersByTimeAsync(OLLAMA_HEALTH_WINDOW_MS);
    expect(spawnMock.mock.calls.length).toBeGreaterThan(initialSpawnCount);
  });

  it('uses taskkill on Windows when stopping a managed Ollama process', async () => {
    setPlatform('win32');
    ollamaRuntime.binaryAvailable = true;

    await loadMainModule();
    const start = getHandler<() => Promise<{ success: boolean }>>('ollama:start');
    await expect(start()).resolves.toEqual({ success: true });
    await flushStartup();

    const stop = getHandler<() => Promise<{ success: boolean }>>('ollama:stop');
    await expect(stop()).resolves.toEqual({ success: true });
    expect(ollamaRuntime.taskkillCalls).toHaveLength(1);
    expect(ollamaRuntime.taskkillCalls[0]).toEqual([
      '/PID',
      expect.any(String),
      '/T',
      '/F',
    ]);
  });
});

const OLLAMA_HEALTH_WINDOW_MS = 10_000 * 3 + 2000;
