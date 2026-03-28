/// <reference types="vite/client" />

import type {
  AppInstallPreparation,
  AppInstallRequest,
  AppInstallResult,
  AppSettingsPreparation,
  AppSettingsSaveRequest,
  AppSettingsSaveResult,
  SystemStatusSnapshot,
  ProviderHealthSnapshot,
  AgentStatusSnapshot,
} from '@nous/shared'
import type {
  FirstRunActionResult,
  FirstRunPrerequisites,
  FirstRunRoleAssignmentInput,
  FirstRunState,
  FirstRunStep,
  HardwareSpec,
  RecommendationResult,
} from '@nous/shared-server'

type OllamaLifecycleState =
  | 'not_installed'
  | 'installed_stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'

type OllamaStatus = {
  installed: boolean
  running: boolean
  state: OllamaLifecycleState
  models: string[]
  defaultModel: string | null
  error?: string
}

type OllamaModelPullProgress = {
  status: string
  digest?: string
  total?: number
  completed?: number
  percent?: number
}

type OllamaOperationResult = {
  success: boolean
  error?: string
}

type PreferencesProvider = 'anthropic' | 'openai'

type PreferencesApiKeyEntry = {
  provider: PreferencesProvider
  configured: boolean
  maskedKey: string | null
  createdAt: string | null
}

type PreferencesTestResult = {
  valid: boolean
  error: string | null
}

type PreferencesSystemStatus = {
  ollama: {
    running: boolean
    models: string[]
  }
  configuredProviders: string[]
  credentialVaultHealthy: boolean
}

type PreferencesAvailableModel = {
  id: string
  name: string
  provider: string
  available: boolean
}

type PreferencesModelSelection = {
  principal: string | null
  system: string | null
}

type RoleAssignmentDisplayEntry = {
  role: string
  providerId: string | null
}

interface ElectronAPI {
  layout: {
    get: () => Promise<unknown>
    set: (layout: unknown) => Promise<void>
  }
  fs: {
    readDir: (path: string) => Promise<{ name: string; isDirectory: boolean; path: string }[]>
    readFile: (path: string) => Promise<string | null>
  }
  chat: {
    send: (message: string) => Promise<{ response: string; traceId: string }>
    getHistory: () => Promise<{ role: string; content: string; timestamp: string }[]>
  }
  usage: {
    getSnapshot: () => Promise<unknown>
  }
  health: {
    systemStatus: () => Promise<SystemStatusSnapshot>
    providerHealth: () => Promise<ProviderHealthSnapshot>
    agentStatus: () => Promise<AgentStatusSnapshot>
  }
  win: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    toggleDevTools: () => Promise<void>
    toggleFullScreen: () => Promise<void>
    isFullScreen: () => Promise<boolean>
  }
  app: {
    quit: () => Promise<void>
    newWindow: () => Promise<void>
  }
  appInstall: {
    prepare: (input: {
      project_id: string
      package_id: string
      release_id?: string
    }) => Promise<AppInstallPreparation>
    install: (input: AppInstallRequest) => Promise<AppInstallResult>
  }
  appSettings: {
    prepare: (input: {
      project_id: string
      package_id: string
    }) => Promise<AppSettingsPreparation>
    save: (input: AppSettingsSaveRequest) => Promise<AppSettingsSaveResult>
  }
  appPanels: {
    list: () => Promise<{
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
      src: string
    }[]>
  }
  mode: {
    get: () => Promise<string | null>
    set: (mode: string) => Promise<void>
  }
  backend: {
    getStatus: () => Promise<{
      ready: boolean
      port: number | null
      trpcUrl: string | null
    }>
    getPort: () => Promise<number | null>
    /** @deprecated Use `window.electronAPI.ollama.getStatus()` instead. */
    getOllamaStatus: () => Promise<OllamaStatus>
  }
  ollama: {
    getStatus: () => Promise<OllamaStatus>
    start: () => Promise<OllamaOperationResult>
    stop: () => Promise<OllamaOperationResult>
    pullModel: (modelId: string) => Promise<void>
    onPullProgress: (callback: (progress: OllamaModelPullProgress) => void) => () => void
    onStateChange: (callback: (status: OllamaStatus) => void) => () => void
  }
  preferences: {
    getApiKeys: () => Promise<PreferencesApiKeyEntry[]>
    setApiKey: (input: { provider: PreferencesProvider; key: string }) => Promise<{ stored: boolean }>
    deleteApiKey: (input: { provider: PreferencesProvider }) => Promise<{ deleted: boolean }>
    testApiKey: (input: { provider: PreferencesProvider; key?: string }) => Promise<PreferencesTestResult>
    getSystemStatus: () => Promise<PreferencesSystemStatus>
    getAvailableModels: () => Promise<{ models: PreferencesAvailableModel[] }>
    getModelSelection: () => Promise<PreferencesModelSelection>
    setModelSelection: (input: { principal?: string; system?: string }) => Promise<{ success: boolean }>
    getRoleAssignments: () => Promise<RoleAssignmentDisplayEntry[]>
    setRoleAssignment: (input: { role: string; modelSpec: string }) => Promise<{ success: boolean; error?: string }>
  }
  hardware: {
    getSpec: () => Promise<HardwareSpec>
    getRecommendations: () => Promise<RecommendationResult>
  }
  firstRun: {
    getWizardState: () => Promise<FirstRunState>
    checkPrerequisites: () => Promise<FirstRunPrerequisites>
    downloadModel: (model: string) => Promise<FirstRunActionResult>
    configureProvider: (modelSpec: string) => Promise<FirstRunActionResult>
    assignRoles: (assignments: FirstRunRoleAssignmentInput[]) => Promise<FirstRunActionResult>
    completeStep: (step: FirstRunStep) => Promise<FirstRunState>
    resetWizard: () => Promise<FirstRunState>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
