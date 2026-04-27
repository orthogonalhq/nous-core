import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());
const osMocks = vi.hoisted(() => ({
  totalmem: vi.fn(),
  freemem: vi.fn(),
  cpus: vi.fn(),
  platform: vi.fn(),
  arch: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
}));

vi.mock('node:os', () => ({
  totalmem: osMocks.totalmem,
  freemem: osMocks.freemem,
  cpus: osMocks.cpus,
  platform: osMocks.platform,
  arch: osMocks.arch,
}));

function mockExecFile(
  handlers: Record<string, { stdout?: string; error?: Error }>,
): void {
  execFileMock.mockImplementation(
    (
      command: string,
      _args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const result = handlers[command];
      if (!result) {
        callback(Object.assign(new Error('command not found'), { code: 'ENOENT' }), '', '');
        return {} as never;
      }

      callback(result.error ?? null, result.stdout ?? '', '');
      return {} as never;
    },
  );
}

async function loadModule() {
  return import('../src/hardware-detection');
}

describe('hardware detection', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    osMocks.totalmem.mockReset().mockReturnValue(16 * 1024 * 1024 * 1024);
    osMocks.freemem.mockReset().mockReturnValue(10 * 1024 * 1024 * 1024);
    osMocks.cpus.mockReset().mockReturnValue(
      Array.from({ length: 8 }, () => ({
        model: 'AMD Ryzen 7 7840U',
        speed: 3300,
        times: {
          user: 0,
          nice: 0,
          sys: 0,
          idle: 0,
          irq: 0,
        },
      })),
    );
    osMocks.platform.mockReset().mockReturnValue('linux');
    osMocks.arch.mockReset().mockReturnValue('x64');

    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detectHardware parses GPU information from nvidia-smi output', async () => {
    mockExecFile({
      'nvidia-smi': {
        stdout: 'NVIDIA GeForce RTX 3060, 12288\n',
      },
    });

    const {
      HardwareSpecSchema,
      detectHardware,
    } = await loadModule();

    const result = await detectHardware();

    expect(HardwareSpecSchema.parse(result)).toEqual(result);
    expect(result.totalMemoryMB).toBe(16384);
    expect(result.availableMemoryMB).toBe(10240);
    expect(result.cpuCores).toBe(8);
    expect(result.cpuModel).toBe('AMD Ryzen 7 7840U');
    expect(result.platform).toBe('linux');
    expect(result.arch).toBe('x64');
    expect(result.gpu).toEqual({
      detected: true,
      name: 'NVIDIA GeForce RTX 3060',
      vramMB: 12288,
    });
  });

  it('detectHardware falls back to gpu.detected=false when GPU probing fails', async () => {
    mockExecFile({
      'system_profiler': {
        error: new Error('system_profiler unavailable'),
      },
    });
    osMocks.platform.mockReturnValue('darwin');
    osMocks.arch.mockReturnValue('arm64');

    const { detectHardware } = await loadModule();
    const result = await detectHardware();

    expect(result.platform).toBe('darwin');
    expect(result.arch).toBe('arm64');
    expect(result.gpu).toEqual({
      detected: false,
    });
    expect(console.warn).toHaveBeenCalled();
  });

  it('recommendModels returns a compact local model for low-memory systems', async () => {
    const { recommendModels } = await loadModule();

    const result = recommendModels(
      {
        totalMemoryMB: 4096,
        availableMemoryMB: 2048,
        cpuCores: 4,
        cpuModel: 'Intel Core i5',
        platform: 'win32',
        arch: 'x64',
        gpu: {
          detected: false,
        },
      },
      {
        name: 'local-only',
        allowLocalProviders: true,
        allowRemoteProviders: false,
      },
    );

    expect(result.profileName).toBe('local-only');
    expect(result.singleModel?.modelSpec).toBe('ollama:llama3.2:3b');
    expect(result.multiModel).toEqual([]);
  });

  it('recommendModels returns split-role local guidance for mid-spec hardware', async () => {
    const { recommendModels } = await loadModule();

    const result = recommendModels(
      {
        totalMemoryMB: 24576,
        availableMemoryMB: 18432,
        cpuCores: 12,
        cpuModel: 'AMD Ryzen 9',
        platform: 'linux',
        arch: 'x64',
        gpu: {
          detected: true,
          name: 'NVIDIA GeForce RTX 4070',
          vramMB: 12288,
        },
      },
      {
        name: 'hybrid',
        allowLocalProviders: true,
        allowRemoteProviders: true,
      },
    );

    expect(result.singleModel?.modelSpec).toBe('ollama:qwen2.5:14b');
    expect(result.multiModel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'cortex-chat',
          recommendation: expect.objectContaining({
            modelSpec: 'ollama:qwen2.5:14b',
          }),
        }),
      ]),
    );
  });

  // SP 1.5 — U1: `recommendModels` carries `validationState: 'pending'`
  // default on every emitted recommendation.
  it('U1 — recommendModels emits validationState: pending by default', async () => {
    const { recommendModels } = await loadModule();

    const result = recommendModels(
      {
        totalMemoryMB: 24576,
        availableMemoryMB: 16000,
        cpuCores: 12,
        cpuModel: 'AMD Ryzen 9',
        platform: 'linux',
        arch: 'x64',
        gpu: { detected: true, name: 'RTX 4070', vramMB: 12288 },
      },
      {
        name: 'local-only',
        allowLocalProviders: true,
        allowRemoteProviders: false,
      },
    );

    expect(result.singleModel?.validationState).toBe('pending');
    for (const entry of result.multiModel) {
      expect(entry.recommendation.validationState).toBe('pending');
    }
  });

  // SP 1.5 — U2: every refreshed catalog entry validates against
  // ModelRecommendationSchema.
  it('U2 — recommendModels output validates against ModelRecommendationSchema across tiers', async () => {
    const { recommendModels, ModelRecommendationSchema } = await loadModule();

    for (const totalMemoryMB of [4096, 8192, 16384, 32768]) {
      const result = recommendModels(
        {
          totalMemoryMB,
          availableMemoryMB: Math.floor(totalMemoryMB / 2),
          cpuCores: 8,
          cpuModel: 'Test CPU',
          platform: 'linux',
          arch: 'x64',
          gpu: { detected: false },
        },
        {
          name: 'local-only',
          allowLocalProviders: true,
          allowRemoteProviders: false,
        },
      );

      if (result.singleModel) {
        expect(() => ModelRecommendationSchema.parse(result.singleModel)).not.toThrow();
      }
      for (const entry of result.multiModel) {
        expect(() => ModelRecommendationSchema.parse(entry.recommendation)).not.toThrow();
      }
    }
  });

  // SP 1.5 — U3: resolveRecommendationTier regression — tier resolution
  // continues to map RAM correctly with the (refreshed) catalog.
  it('U3 — tier resolution regression: 4 GB → tiny, 8 GB → small, 16 GB → medium, 32 GB → large', async () => {
    const { recommendModels } = await loadModule();
    const profile = {
      name: 'local-only',
      allowLocalProviders: true,
      allowRemoteProviders: false,
    };
    const baseSpec = {
      availableMemoryMB: 2048,
      cpuCores: 4,
      cpuModel: 'Test CPU',
      platform: 'linux',
      arch: 'x64',
      gpu: { detected: false },
    } as const;

    const tiny = recommendModels({ ...baseSpec, totalMemoryMB: 4096 }, profile);
    const small = recommendModels({ ...baseSpec, totalMemoryMB: 8192 }, profile);
    const medium = recommendModels({ ...baseSpec, totalMemoryMB: 16384 }, profile);
    const large = recommendModels({ ...baseSpec, totalMemoryMB: 32768 }, profile);

    expect(tiny.singleModel?.modelSpec).toBe('ollama:llama3.2:3b');
    expect(small.singleModel?.modelSpec).toBe('ollama:qwen2.5:7b');
    expect(medium.singleModel?.modelSpec).toBe('ollama:qwen2.5:14b');
    expect(large.singleModel?.modelSpec).toBe('ollama:qwen2.5:32b');
  });

  it('recommendModels honors remote-only profile boundaries', async () => {
    const { recommendModels } = await loadModule();

    const result = recommendModels(
      {
        totalMemoryMB: 32768,
        availableMemoryMB: 20000,
        cpuCores: 16,
        cpuModel: 'Apple M3 Max',
        platform: 'darwin',
        arch: 'arm64',
        gpu: {
          detected: true,
          name: 'Apple M3 Max',
          vramMB: 16384,
        },
      },
      {
        name: 'remote-only',
        allowLocalProviders: false,
        allowRemoteProviders: true,
      },
    );

    expect(result.profileName).toBe('remote-only');
    expect(result.singleModel?.modelSpec.startsWith('anthropic:')).toBe(true);
    expect(result.multiModel.every((entry) => !entry.recommendation.modelSpec.startsWith('ollama:'))).toBe(true);
  });
});
