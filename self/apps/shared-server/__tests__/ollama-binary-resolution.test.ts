import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
const originalEnv = {
  LOCALAPPDATA: process.env.LOCALAPPDATA,
  OLLAMA_PATH: process.env.OLLAMA_PATH,
};

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
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

function mockExecFile(successByCommand: Record<string, boolean>): void {
  execFileMock.mockImplementation(
    (
      command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      if (successByCommand[command]) {
        callback(null, 'ollama version 0.6.0', '');
        return {} as never;
      }

      callback(Object.assign(new Error('command not found'), { code: 'ENOENT' }), '', '');
      return {} as never;
    },
  );
}

async function loadModule() {
  return import('../src/ollama-detection');
}

describe('resolveOllamaBinary', () => {
  beforeEach(() => {
    vi.resetModules();
    execFileMock.mockReset();
    delete process.env.OLLAMA_PATH;
    delete process.env.LOCALAPPDATA;
    restorePlatform();
  });

  afterEach(() => {
    restorePlatform();
    process.env.LOCALAPPDATA = originalEnv.LOCALAPPDATA;
    process.env.OLLAMA_PATH = originalEnv.OLLAMA_PATH;
    vi.restoreAllMocks();
  });

  it('prefers the OLLAMA_PATH env override when it probes successfully', async () => {
    setPlatform('win32');
    process.env.OLLAMA_PATH = 'C:\\custom\\ollama.exe';
    mockExecFile({
      'C:\\custom\\ollama.exe': true,
    });

    const { resolveOllamaBinary } = await loadModule();
    await expect(resolveOllamaBinary()).resolves.toEqual({
      found: true,
      command: 'C:\\custom\\ollama.exe',
      resolvedVia: 'env_override',
      platform: 'win32',
    });
  });

  it('falls back from an invalid OLLAMA_PATH to PATH lookup', async () => {
    setPlatform('linux');
    process.env.OLLAMA_PATH = '/custom/ollama';
    mockExecFile({
      ollama: true,
    });

    const { resolveOllamaBinary } = await loadModule();
    await expect(resolveOllamaBinary()).resolves.toEqual({
      found: true,
      command: 'ollama',
      resolvedVia: 'path_lookup',
      platform: 'linux',
    });
  });

  it('uses the Windows LOCALAPPDATA default path when PATH lookup fails', async () => {
    setPlatform('win32');
    process.env.LOCALAPPDATA = 'C:\\Users\\nous\\AppData\\Local';
    const expectedPath = 'C:\\Users\\nous\\AppData\\Local\\Programs\\Ollama\\ollama.exe';
    mockExecFile({
      [expectedPath]: true,
    });

    const { resolveOllamaBinary } = await loadModule();
    await expect(resolveOllamaBinary()).resolves.toEqual({
      found: true,
      command: expectedPath,
      resolvedVia: 'platform_default',
      platform: 'win32',
    });
  });

  it('uses the macOS default path when PATH lookup fails', async () => {
    setPlatform('darwin');
    mockExecFile({
      '/usr/local/bin/ollama': true,
    });

    const { resolveOllamaBinary } = await loadModule();
    await expect(resolveOllamaBinary()).resolves.toEqual({
      found: true,
      command: '/usr/local/bin/ollama',
      resolvedVia: 'platform_default',
      platform: 'darwin',
    });
  });

  it('returns not found on Linux when neither env nor PATH resolution succeeds', async () => {
    setPlatform('linux');
    mockExecFile({});

    const { resolveOllamaBinary } = await loadModule();
    await expect(resolveOllamaBinary()).resolves.toEqual({
      found: false,
      command: null,
      resolvedVia: null,
      platform: 'linux',
    });
  });
});
