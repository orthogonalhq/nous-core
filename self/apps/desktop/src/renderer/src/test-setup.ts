import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

type ElectronAPI = Window['electronAPI']
type FirstRunState = Awaited<ReturnType<ElectronAPI['firstRun']['getWizardState']>>
type FirstRunPrerequisites = Awaited<ReturnType<ElectronAPI['firstRun']['checkPrerequisites']>>
type FirstRunActionResult = Awaited<ReturnType<ElectronAPI['firstRun']['downloadModel']>>
type FirstRunRoleAssignmentInput = Parameters<ElectronAPI['firstRun']['assignRoles']>[0]
type OllamaStatus = Awaited<ReturnType<ElectronAPI['ollama']['getStatus']>>
type PreferencesSystemStatus = Awaited<ReturnType<ElectronAPI['preferences']['getSystemStatus']>>
type OllamaModelPullProgress = Parameters<ElectronAPI['ollama']['onPullProgress']>[0] extends (
  progress: infer T,
) => void
  ? T
  : never

export const DEFAULT_OLLAMA_STATUS: OllamaStatus = {
  installed: true,
  running: true,
  state: 'running',
  models: ['qwen2.5:7b'],
  defaultModel: 'qwen2.5:7b',
}

export const DEFAULT_WIZARD_STATE: FirstRunState = {
  currentStep: 'ollama_check',
  complete: false,
  steps: {
    ollama_check: { status: 'pending' },
    model_download: { status: 'pending' },
    provider_config: { status: 'pending' },
    role_assignment: { status: 'pending' },
  },
  lastUpdatedAt: '2026-03-22T00:00:00.000Z',
}

export const DEFAULT_PREREQUISITES: FirstRunPrerequisites = {
  ollama: DEFAULT_OLLAMA_STATUS,
  hardware: {
    totalMemoryMB: 32768,
    availableMemoryMB: 24576,
    cpuCores: 12,
    cpuModel: 'AMD Ryzen 9',
    platform: 'win32',
    arch: 'x64',
    gpu: {
      detected: true,
      name: 'RTX 4080',
      vramMB: 16384,
    },
  },
  recommendations: {
    singleModel: {
      modelId: 'qwen2.5:7b',
      modelSpec: 'ollama:qwen2.5:7b',
      displayName: 'Qwen 2.5 7B',
      ramRequiredMB: 8192,
      reason: 'Balanced local default for desktop orchestration.',
    },
    multiModel: [
      {
        role: 'reasoner',
        recommendation: {
          modelId: 'qwen2.5:14b',
          modelSpec: 'ollama:qwen2.5:14b',
          displayName: 'Qwen 2.5 14B',
          ramRequiredMB: 16384,
          reason: 'Use the stronger local model for heavier reasoning.',
        },
      },
      {
        role: 'vision',
        recommendation: {
          modelId: 'llama3.2:3b',
          modelSpec: 'ollama:llama3.2:3b',
          displayName: 'Llama 3.2 3B',
          ramRequiredMB: 4096,
          reason: 'Lightweight support model for specialist roles.',
        },
      },
    ],
    hardwareSpec: {
      totalMemoryMB: 32768,
      availableMemoryMB: 24576,
      cpuCores: 12,
      cpuModel: 'AMD Ryzen 9',
      platform: 'win32',
      arch: 'x64',
      gpu: {
        detected: true,
        name: 'RTX 4080',
        vramMB: 16384,
      },
    },
    profileName: 'local-first',
    advisory: 'Detected a high-spec desktop profile. Larger local reasoning models are viable.',
  },
}

export const DEFAULT_PREFERENCES_STATUS: PreferencesSystemStatus = {
  ollama: {
    running: true,
    models: ['qwen2.5:7b'],
  },
  configuredProviders: ['anthropic'],
  credentialVaultHealthy: true,
}

export function createFirstRunState(overrides: Partial<FirstRunState> = {}): FirstRunState {
  return {
    ...DEFAULT_WIZARD_STATE,
    ...overrides,
    steps: {
      ...DEFAULT_WIZARD_STATE.steps,
      ...overrides.steps,
    },
  }
}

export function createFirstRunActionResult(
  state: FirstRunState,
  success = true,
  error?: string,
): FirstRunActionResult {
  return {
    success,
    state,
    ...(error ? { error } : {}),
  }
}

export function createPrerequisites(
  overrides: Partial<FirstRunPrerequisites> = {},
): FirstRunPrerequisites {
  return {
    ...DEFAULT_PREREQUISITES,
    ...overrides,
    ollama: {
      ...DEFAULT_PREREQUISITES.ollama,
      ...overrides.ollama,
    },
    hardware: {
      ...DEFAULT_PREREQUISITES.hardware,
      ...overrides.hardware,
      gpu: {
        ...DEFAULT_PREREQUISITES.hardware.gpu,
        ...overrides.hardware?.gpu,
      },
    },
    recommendations: {
      ...DEFAULT_PREREQUISITES.recommendations,
      ...overrides.recommendations,
      hardwareSpec: {
        ...DEFAULT_PREREQUISITES.recommendations.hardwareSpec,
        ...overrides.recommendations?.hardwareSpec,
        gpu: {
          ...DEFAULT_PREREQUISITES.recommendations.hardwareSpec.gpu,
          ...overrides.recommendations?.hardwareSpec?.gpu,
        },
      },
    },
  }
}

export function createElectronAPIMock() {
  const pullProgressListeners = new Set<(progress: OllamaModelPullProgress) => void>()
  const ollamaStateListeners = new Set<(status: OllamaStatus) => void>()

  const api = {
    layout: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => {}),
    },
    fs: {
      readDir: vi.fn(async () => []),
      readFile: vi.fn(async () => null),
    },
    chat: {
      send: vi.fn(async () => ({ response: 'ok', traceId: 'trace-1' })),
      getHistory: vi.fn(async () => []),
    },
    usage: {
      getSnapshot: vi.fn(async () => ({})),
    },
    win: {
      minimize: vi.fn(async () => {}),
      maximize: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      isMaximized: vi.fn(async () => false),
      toggleDevTools: vi.fn(async () => {}),
      toggleFullScreen: vi.fn(async () => {}),
      isFullScreen: vi.fn(async () => false),
    },
    app: {
      quit: vi.fn(async () => {}),
      newWindow: vi.fn(async () => {}),
    },
    appInstall: {
      prepare: vi.fn(async () => {
        throw new Error('Not implemented in renderer tests')
      }),
      install: vi.fn(async () => {
        throw new Error('Not implemented in renderer tests')
      }),
    },
    appSettings: {
      prepare: vi.fn(async () => {
        throw new Error('Not implemented in renderer tests')
      }),
      save: vi.fn(async () => {
        throw new Error('Not implemented in renderer tests')
      }),
    },
    appPanels: {
      list: vi.fn(async () => []),
    },
    backend: {
      getStatus: vi.fn(async () => ({
        ready: true,
        port: 4317,
        trpcUrl: 'http://127.0.0.1:4317/trpc',
      })),
      getOllamaStatus: vi.fn(async () => DEFAULT_OLLAMA_STATUS),
    },
    ollama: {
      getStatus: vi.fn(async () => DEFAULT_OLLAMA_STATUS),
      start: vi.fn(async () => ({ success: true })),
      stop: vi.fn(async () => ({ success: true })),
      pullModel: vi.fn(async () => {}),
      onPullProgress: vi.fn((callback: (progress: OllamaModelPullProgress) => void) => {
        pullProgressListeners.add(callback)
        return () => {
          pullProgressListeners.delete(callback)
        }
      }),
      onStateChange: vi.fn((callback: (status: OllamaStatus) => void) => {
        ollamaStateListeners.add(callback)
        return () => {
          ollamaStateListeners.delete(callback)
        }
      }),
    },
    preferences: {
      getApiKeys: vi.fn(async () => []),
      setApiKey: vi.fn(async () => ({ stored: true })),
      deleteApiKey: vi.fn(async () => ({ deleted: true })),
      testApiKey: vi.fn(async () => ({ valid: true, error: null })),
      getSystemStatus: vi.fn(async () => DEFAULT_PREFERENCES_STATUS),
      getAvailableModels: vi.fn(async () => ({
        models: [
          {
            id: 'ollama:qwen2.5:7b',
            name: 'Qwen 2.5 7B',
            provider: 'ollama',
            available: true,
          },
        ],
      })),
      getModelSelection: vi.fn(async () => ({
        principal: 'ollama:qwen2.5:7b',
        system: 'ollama:qwen2.5:7b',
      })),
      setModelSelection: vi.fn(async () => ({ success: true })),
      getRoleAssignments: vi.fn(async () => []),
      setRoleAssignment: vi.fn(async () => ({ success: true })),
    },
    hardware: {
      getSpec: vi.fn(async () => DEFAULT_PREREQUISITES.hardware),
      getRecommendations: vi.fn(async () => DEFAULT_PREREQUISITES.recommendations),
    },
    firstRun: {
      getWizardState: vi.fn(async () => DEFAULT_WIZARD_STATE),
      checkPrerequisites: vi.fn(async () => DEFAULT_PREREQUISITES),
      downloadModel: vi.fn(async () => createFirstRunActionResult(createFirstRunState({
        currentStep: 'provider_config',
        steps: {
          ...DEFAULT_WIZARD_STATE.steps,
          model_download: {
            status: 'complete',
            completedAt: '2026-03-22T00:05:00.000Z',
          },
        },
      }))),
      configureProvider: vi.fn(async () => createFirstRunActionResult(createFirstRunState({
        currentStep: 'role_assignment',
        steps: {
          ...DEFAULT_WIZARD_STATE.steps,
          model_download: {
            status: 'complete',
            completedAt: '2026-03-22T00:05:00.000Z',
          },
          provider_config: {
            status: 'complete',
            completedAt: '2026-03-22T00:06:00.000Z',
          },
        },
      }))),
      assignRoles: vi.fn(async (_assignments: FirstRunRoleAssignmentInput) => createFirstRunActionResult(createFirstRunState({
        currentStep: 'complete',
        complete: true,
        completedAt: '2026-03-22T00:07:00.000Z',
        steps: {
          ollama_check: {
            status: 'complete',
            completedAt: '2026-03-22T00:04:00.000Z',
          },
          model_download: {
            status: 'complete',
            completedAt: '2026-03-22T00:05:00.000Z',
          },
          provider_config: {
            status: 'complete',
            completedAt: '2026-03-22T00:06:00.000Z',
          },
          role_assignment: {
            status: 'complete',
            completedAt: '2026-03-22T00:07:00.000Z',
          },
        },
      }))),
      completeStep: vi.fn(async (step) => createFirstRunState({
        currentStep: step === 'ollama_check' ? 'model_download' : 'complete',
        complete: step === 'role_assignment',
        completedAt: step === 'role_assignment' ? '2026-03-22T00:07:00.000Z' : undefined,
        steps: {
          ...DEFAULT_WIZARD_STATE.steps,
          [step]: {
            status: 'complete',
            completedAt: '2026-03-22T00:04:00.000Z',
          },
        },
      })),
      resetWizard: vi.fn(async () => DEFAULT_WIZARD_STATE),
    },
  } satisfies ElectronAPI

  return Object.assign(api, {
    __emitPullProgress: (progress: OllamaModelPullProgress) => {
      for (const listener of pullProgressListeners) {
        listener(progress)
      }
    },
    __emitOllamaStateChange: (status: OllamaStatus) => {
      for (const listener of ollamaStateListeners) {
        listener(status)
      }
    },
  })
}

export type ElectronAPIMock = ReturnType<typeof createElectronAPIMock>

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

beforeEach(() => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    writable: true,
    value: createElectronAPIMock(),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
