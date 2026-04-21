import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const detectHardwareMock = vi.hoisted(() => vi.fn());
const recommendModelsMock = vi.hoisted(() => vi.fn());
const detectOllamaMock = vi.hoisted(() => vi.fn());
const pullOllamaModelMock = vi.hoisted(() => vi.fn());
const firstRunMock = vi.hoisted(() => ({
  getFirstRunState: vi.fn(),
  isFirstRunComplete: vi.fn(),
  markFirstRunComplete: vi.fn(),
  markStepComplete: vi.fn(),
  resetFirstRunState: vi.fn(),
}));
const bootstrapConstants = vi.hoisted(() => ({
  WELL_KNOWN_PROVIDER_IDS: {
    anthropic: '10000000-0000-0000-0000-000000000001',
    openai: '10000000-0000-0000-0000-000000000002',
  },
  OLLAMA_WELL_KNOWN_PROVIDER_ID: '10000000-0000-0000-0000-000000000003',
}));
const bootstrapMock = vi.hoisted(() => ({
  buildOllamaProviderConfig: vi.fn(),
  buildProviderConfig: vi.fn(),
  parseSelectedModelSpec: vi.fn(),
  updateRoleAssignment: vi.fn(),
  upsertProviderConfig: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('../src/hardware-detection', async () => {
  const actual = await vi.importActual<typeof import('../src/hardware-detection')>(
    '../src/hardware-detection',
  );

  return {
    ...actual,
    detectHardware: detectHardwareMock,
    recommendModels: recommendModelsMock,
  };
});

vi.mock('../src/ollama-detection', async () => {
  const actual = await vi.importActual<typeof import('../src/ollama-detection')>(
    '../src/ollama-detection',
  );

  return {
    ...actual,
    detectOllama: detectOllamaMock,
    pullOllamaModel: pullOllamaModelMock,
  };
});

vi.mock('../src/first-run', async () => {
  const actual = await vi.importActual<typeof import('../src/first-run')>(
    '../src/first-run',
  );

  return {
    ...actual,
    getFirstRunState: firstRunMock.getFirstRunState,
    isFirstRunComplete: firstRunMock.isFirstRunComplete,
    markFirstRunComplete: firstRunMock.markFirstRunComplete,
    markStepComplete: firstRunMock.markStepComplete,
    resetFirstRunState: firstRunMock.resetFirstRunState,
  };
});

vi.mock('../src/bootstrap', () => ({
  OLLAMA_WELL_KNOWN_PROVIDER_ID: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
  WELL_KNOWN_PROVIDER_IDS: bootstrapConstants.WELL_KNOWN_PROVIDER_IDS,
  buildOllamaProviderConfig: bootstrapMock.buildOllamaProviderConfig,
  buildProviderConfig: bootstrapMock.buildProviderConfig,
  parseSelectedModelSpec: bootstrapMock.parseSelectedModelSpec,
  updateRoleAssignment: bootstrapMock.updateRoleAssignment,
  upsertProviderConfig: bootstrapMock.upsertProviderConfig,
  recomposeAgentHarnesses: vi.fn(),
}));

// SP 1.3 — `agent_identity` added to FIRST_RUN_STEP_VALUES per SDS § 0 Note 2.
// Treat it as already-complete in this fixture (existing pre-SP-1.3 wizard
// scenarios bypass the identity step).
function createWizardState(
  currentStep:
    | 'ollama_check'
    | 'agent_identity'
    | 'model_download'
    | 'provider_config'
    | 'role_assignment'
    | 'complete',
) {
  const completed = currentStep === 'complete';
  return {
    currentStep,
    complete: completed,
    steps: {
      ollama_check: {
        status:
          currentStep === 'ollama_check' ? 'pending' : 'complete',
      },
      agent_identity: {
        status:
          currentStep === 'ollama_check' || currentStep === 'agent_identity'
            ? 'pending'
            : 'complete',
      },
      model_download: {
        status:
          currentStep === 'ollama_check' ||
          currentStep === 'agent_identity' ||
          currentStep === 'model_download'
            ? 'pending'
            : 'complete',
      },
      provider_config: {
        status:
          currentStep === 'ollama_check' ||
          currentStep === 'agent_identity' ||
          currentStep === 'model_download' ||
          currentStep === 'provider_config'
            ? 'pending'
            : 'complete',
      },
      role_assignment: {
        status:
          currentStep === 'complete' ? 'complete' : 'pending',
      },
    },
    ...(completed ? { completedAt: '2026-03-22T16:30:00.000Z' } : {}),
    lastUpdatedAt: '2026-03-22T16:30:00.000Z',
  };
}

function parseSelectedModelSpecMock(
  spec: string | null | undefined,
): { provider: 'anthropic' | 'openai' | 'ollama'; modelId: string } | null {
  if (!spec) {
    return null;
  }

  const [provider, ...modelParts] = spec.split(':');
  const modelId = modelParts.join(':');
  if (
    (provider !== 'anthropic' &&
      provider !== 'openai' &&
      provider !== 'ollama') ||
    modelId.length === 0
  ) {
    return null;
  }

  return {
    provider,
    modelId,
  };
}

function buildProviderConfigMock(
  provider: 'anthropic' | 'openai',
  providerId = bootstrapConstants.WELL_KNOWN_PROVIDER_IDS[provider],
  modelId = provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
) {
  return {
    id: providerId,
    name: provider,
    type: 'text' as const,
    endpoint:
      provider === 'anthropic'
        ? 'https://api.anthropic.com'
        : 'https://api.openai.com',
    modelId,
    isLocal: false,
    capabilities: ['chat', 'streaming'],
    providerClass: 'remote_text' as const,
  };
}

function buildOllamaProviderConfigMock(
  modelId: string,
  providerId = bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
) {
  return {
    id: providerId,
    name: 'ollama',
    type: 'text' as const,
    endpoint: 'http://localhost:11434',
    modelId,
    isLocal: true,
    capabilities: ['chat', 'streaming'],
    providerClass: 'local_text' as const,
  };
}

function createMockContext() {
  return {
    dataDir: 'C:/Users/nous/AppData/Roaming/Nous/data',
    projectStore: {
      list: vi.fn().mockResolvedValue([]),
    },
    config: {
      get: vi.fn().mockReturnValue({
        profile: {
          name: 'local-only',
          allowLocalProviders: true,
          allowRemoteProviders: false,
        },
      }),
      // SP 1.3 — IConfig agent-block readers/writers (Decision 7).
      // Stubbed out for the mocked first-run.ts paths exercised by this
      // suite (downloadModel / configureProvider / completeStep /
      // resetWizard). The new writeIdentity procedure has dedicated
      // integration tests in `first-run-identity.test.ts` with a real
      // ConfigManager.
      getAgentName: vi.fn().mockReturnValue('Nous'),
      getPersonalityConfig: vi.fn().mockReturnValue({ preset: 'balanced' }),
      getUserProfile: vi.fn().mockReturnValue({}),
      getWelcomeMessageSent: vi.fn().mockReturnValue(false),
      setAgentName: vi.fn().mockResolvedValue(undefined),
      setPersonalityConfig: vi.fn().mockResolvedValue(undefined),
      setUserProfile: vi.fn().mockResolvedValue(undefined),
      setWelcomeMessageSent: vi.fn().mockResolvedValue(undefined),
      clearAgentBlock: vi.fn().mockResolvedValue(undefined),
    },
  } as any;
}

async function loadFirstRunRouter() {
  return (await import('../src/trpc/routers/first-run')).firstRunRouter;
}

describe('first-run wizard router', () => {
  beforeEach(() => {
    detectHardwareMock.mockReset().mockResolvedValue({
      totalMemoryMB: 16384,
      availableMemoryMB: 8192,
      cpuCores: 8,
      cpuModel: 'AMD Ryzen 7',
      platform: 'win32',
      arch: 'x64',
      gpu: {
        detected: false,
      },
    });
    recommendModelsMock.mockReset().mockReturnValue({
      singleModel: {
        modelId: 'llama3.2:3b',
        modelSpec: 'ollama:llama3.2:3b',
        displayName: 'Llama 3.2 3B',
        ramRequiredMB: 4096,
        reason: 'Good default.',
      },
      multiModel: [],
      hardwareSpec: {
        totalMemoryMB: 16384,
        availableMemoryMB: 8192,
        cpuCores: 8,
        cpuModel: 'AMD Ryzen 7',
        platform: 'win32',
        arch: 'x64',
        gpu: {
          detected: false,
        },
      },
      profileName: 'local-only',
      advisory: 'Start with a compact local model.',
    });
    detectOllamaMock.mockReset().mockResolvedValue({
      installed: true,
      running: true,
      state: 'running',
      models: ['llama3.2:3b'],
      defaultModel: 'llama3.2:3b',
    });
    pullOllamaModelMock.mockReset().mockResolvedValue(undefined);

    firstRunMock.getFirstRunState.mockReset().mockResolvedValue(createWizardState('ollama_check'));
    firstRunMock.isFirstRunComplete.mockReset().mockResolvedValue(false);
    firstRunMock.markFirstRunComplete.mockReset();
    firstRunMock.markStepComplete.mockReset().mockResolvedValue(createWizardState('provider_config'));
    firstRunMock.resetFirstRunState.mockReset().mockResolvedValue(createWizardState('ollama_check'));

    bootstrapMock.buildOllamaProviderConfig.mockReset().mockImplementation(buildOllamaProviderConfigMock);
    bootstrapMock.buildProviderConfig.mockReset().mockImplementation(buildProviderConfigMock);
    bootstrapMock.parseSelectedModelSpec.mockReset().mockImplementation(parseSelectedModelSpecMock);
    bootstrapMock.updateRoleAssignment.mockReset().mockResolvedValue(undefined);
    bootstrapMock.upsertProviderConfig.mockReset().mockResolvedValue(undefined);

    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves the existing status and complete endpoints', async () => {
    const ctx = createMockContext();
    firstRunMock.isFirstRunComplete.mockResolvedValueOnce(true);

    const firstRunRouter = await loadFirstRunRouter();
    const caller = firstRunRouter.createCaller(ctx);

    await expect(caller.status()).resolves.toEqual({ complete: true });
    await expect(caller.complete()).resolves.toBeUndefined();
    expect(firstRunMock.markFirstRunComplete).toHaveBeenCalledWith(ctx.dataDir);
  });

  it('returns combined prerequisite data and passes the active profile into recommendations', async () => {
    const ctx = createMockContext();
    const firstRunRouter = await loadFirstRunRouter();
    const caller = firstRunRouter.createCaller(ctx);

    const result = await caller.checkPrerequisites();

    expect(result).toEqual({
      ollama: expect.objectContaining({
        state: 'running',
        models: ['llama3.2:3b'],
      }),
      hardware: expect.objectContaining({
        totalMemoryMB: 16384,
      }),
      recommendations: expect.objectContaining({
        profileName: 'local-only',
      }),
      // SP 1.5 — `checkPrerequisites` includes a registry-availability
      // validation map keyed by `modelSpec`. The test environment cannot
      // reach the registry, so every spec resolves to `'offline'` (graceful
      // degradation per Decision 5).
      validation: expect.any(Object),
    });
    expect(recommendModelsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        totalMemoryMB: 16384,
      }),
      {
        name: 'local-only',
        allowLocalProviders: true,
        allowRemoteProviders: false,
      },
    );
  });

  it('downloads a model and marks the download step complete', async () => {
    const ctx = createMockContext();
    firstRunMock.markStepComplete.mockResolvedValueOnce(createWizardState('provider_config'));

    const firstRunRouter = await loadFirstRunRouter();
    const caller = firstRunRouter.createCaller(ctx);
    const result = await caller.downloadModel({ model: 'llama3.2:3b' });

    expect(pullOllamaModelMock).toHaveBeenCalledWith('llama3.2:3b');
    expect(firstRunMock.markStepComplete).toHaveBeenCalledWith(
      ctx.dataDir,
      'model_download',
    );
    expect(result).toEqual({
      success: true,
      state: createWizardState('provider_config'),
    });
  });

  it('configures the selected provider and updates the default reasoner assignment', async () => {
    const ctx = createMockContext();
    firstRunMock.markStepComplete.mockResolvedValueOnce(createWizardState('role_assignment'));

    const firstRunRouter = await loadFirstRunRouter();
    const caller = firstRunRouter.createCaller(ctx);
    const result = await caller.configureProvider({
      modelSpec: 'ollama:llama3.2:3b',
    });

    expect(bootstrapMock.buildOllamaProviderConfig).toHaveBeenCalledWith(
      'llama3.2:3b',
      bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
    );
    expect(bootstrapMock.upsertProviderConfig).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        id: bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
        modelId: 'llama3.2:3b',
      }),
    );
    expect(bootstrapMock.updateRoleAssignment).toHaveBeenCalledWith(
      ctx,
      'cortex-chat',
      bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
    );
    expect(result).toEqual({
      success: true,
      state: createWizardState('role_assignment'),
    });
  });

  it('assigns roles through the existing provider wiring helpers', async () => {
    const ctx = createMockContext();
    firstRunMock.markStepComplete.mockResolvedValueOnce(createWizardState('complete'));

    const firstRunRouter = await loadFirstRunRouter();
    const caller = firstRunRouter.createCaller(ctx);
    const result = await caller.assignRoles({
      assignments: [
        {
          role: 'orchestrators',
          modelSpec: 'ollama:llama3.2:3b',
        },
        {
          role: 'cortex-chat',
          modelSpec: 'openai:gpt-4o',
        },
      ],
    });

    expect(bootstrapMock.upsertProviderConfig).toHaveBeenCalledTimes(2);
    expect(bootstrapMock.updateRoleAssignment).toHaveBeenNthCalledWith(
      1,
      ctx,
      'orchestrators',
      bootstrapConstants.OLLAMA_WELL_KNOWN_PROVIDER_ID,
    );
    expect(bootstrapMock.updateRoleAssignment).toHaveBeenNthCalledWith(
      2,
      ctx,
      'cortex-chat',
      bootstrapConstants.WELL_KNOWN_PROVIDER_IDS.openai,
    );
    expect(result).toEqual({
      success: true,
      state: createWizardState('complete'),
    });
  });

  it('delegates completeStep and resetWizard to the first-run state module', async () => {
    const ctx = createMockContext();
    firstRunMock.markStepComplete.mockResolvedValueOnce(createWizardState('model_download'));
    firstRunMock.resetFirstRunState.mockResolvedValueOnce(createWizardState('ollama_check'));

    const firstRunRouter = await loadFirstRunRouter();
    const caller = firstRunRouter.createCaller(ctx);

    await expect(caller.completeStep({ step: 'ollama_check' })).resolves.toEqual(
      createWizardState('model_download'),
    );
    await expect(caller.resetWizard()).resolves.toEqual(
      createWizardState('ollama_check'),
    );
    expect(firstRunMock.markStepComplete).toHaveBeenCalledWith(
      ctx.dataDir,
      'ollama_check',
    );
    expect(firstRunMock.resetFirstRunState).toHaveBeenCalledWith(ctx.dataDir);
  });
});

// SP 1.8 Fix #9 — Cross-axis derivation tests for `buildValidationMap`.
// Validates the local-axis short-circuit (Goals C7 / C9) and the
// `(local)` log-line annotation (Goals C8). Trace: SDS § 4.5 / Plan Task #9.
describe('buildValidationMap — cross-axis derivation (RC-2a + RC-2b)', () => {
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    // Clear the per-spec cache between tests (the local-axis short-circuit
    // does NOT write the cache, but the registry path does).
    const { __resetRegistryAvailabilityCacheForTesting } = await vi.importActual<
      typeof import('../src/ollama-detection')
    >('../src/ollama-detection');
    __resetRegistryAvailabilityCacheForTesting();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function loadBuildValidationMap() {
    return (await import('../src/trpc/routers/first-run')).buildValidationMap;
  }

  it('locally-installed spec short-circuits to "validated" without invoking the registry HEAD probe (BT R2 spec-mismatch case)', async () => {
    const buildValidationMap = await loadBuildValidationMap();
    const result = await buildValidationMap(
      ['ollama:qwen2.5:32b'],
      ['qwen2.5:32b'],
    );
    expect(result).toEqual({ 'ollama:qwen2.5:32b': 'validated' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[nous:first-run] validation: ollama:qwen2.5:32b -> validated (local)',
    );
  });

  it('falls through to the registry HEAD probe when the spec is NOT locally installed', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const buildValidationMap = await loadBuildValidationMap();
    const result = await buildValidationMap(['ollama:qwen2.5:32b'], []);
    expect(result['ollama:qwen2.5:32b']).toBe('validated');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mixed list: locally-installed short-circuits; registry-only falls through', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);
    const buildValidationMap = await loadBuildValidationMap();
    const result = await buildValidationMap(
      ['ollama:qwen2.5:32b', 'ollama:llama3.2:3b'],
      ['qwen2.5:32b'],
    );
    expect(result['ollama:qwen2.5:32b']).toBe('validated');
    expect(result['ollama:llama3.2:3b']).toBe('unavailable');
    // Only the non-local spec hit the network.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
