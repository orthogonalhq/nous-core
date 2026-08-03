import type React from 'react'
import type {
  AppSettingsPreparation,
  AppSettingsSaveRequest,
  AppSettingsSaveResult,
  ModelRole,
} from '@nous/shared'

// ─── Import and re-export from shell types (canonical ShellMode) ──────────────

import type { ShellMode } from '../../components/shell/types'
export type { ShellMode } from '../../components/shell/types'

// ─── Canonical types (primary definitions — formerly in PreferencesPanel.tsx) ──

export type Provider = string

export interface ApiKeyEntry {
  provider: Provider
  displayName: string
  configured: boolean
  maskedKey: string | null
  createdAt: string | null
}

export interface OllamaInfo {
  running: boolean
  models: string[]
}

export type ProviderConnectionStatus =
  | 'ready'
  | 'missing_credentials'
  | 'not_running'
  | 'not_checked'
  | 'unavailable'

export type ProviderAuthKind = 'api_key' | 'local_session' | 'none' | 'custom'

export interface ProviderConnection {
  provider: string
  displayName: string
  authKind: ProviderAuthKind
  configured: boolean
  selectable: boolean
  status: ProviderConnectionStatus
  message?: string
  setupCommand?: string
  versionCommand?: string
}

export interface SystemStatus {
  ollama: OllamaInfo
  configuredProviders: string[]
  providerConnections?: ProviderConnection[]
  credentialVaultHealthy: boolean
}

export interface TestResult {
  valid: boolean
  error: string | null
}

export interface FeedbackState {
  message: string
  success: boolean
}

export interface AvailableModel {
  id: string
  name: string
  provider: string
  providerLabel?: string
  available: boolean
  authKind?: ProviderAuthKind
  availabilityReason?: string
  executionCapabilityProfile?: 'one_shot_command' | 'session_bound_command' | 'persistent_process'
  roleCompatibility?: Record<string, {
    selectable: boolean
    reason?: string
    executionCapabilityProfile?: 'one_shot_command' | 'session_bound_command' | 'persistent_process'
    requiredExecutionCapabilityProfile?: 'one_shot_command' | 'session_bound_command' | 'persistent_process'
  }>
}

export interface RoleAssignmentDisplayEntry {
  role: string
  modelSpec: string | null
  providerId?: string | null
}

export interface HydratedRoleAssignmentDisplayEntry extends RoleAssignmentDisplayEntry {
  displayName?: string | null
}

export interface RecommendedModel {
  modelSpec: string
  displayName: string
  reason: string
}

export interface RoleModelRecommendation {
  role: ModelRole
  recommendation: RecommendedModel
}

export interface HardwareRecommendations {
  singleModel: RecommendedModel | null
  multiModel: RoleModelRecommendation[]
  advisory: string
}

export interface OllamaModelEntry {
  name: string
  size: number
  modifiedAt: string
}

/** API surface the host must provide via panel params. */
export interface PreferencesApi {
  getApiKeys: () => Promise<ApiKeyEntry[]>
  setApiKey: (input: { provider: Provider; key: string }) => Promise<{ stored: boolean }>
  deleteApiKey: (input: { provider: Provider }) => Promise<{ deleted: boolean }>
  testApiKey: (input: { provider: Provider; key?: string }) => Promise<TestResult>
  getSystemStatus: () => Promise<SystemStatus>
  resetWizard?: () => Promise<unknown>
  getAvailableModels?: () => Promise<{ models: AvailableModel[] }>
  getRoleAssignments?: () => Promise<RoleAssignmentDisplayEntry[]>
  getHardwareRecommendations?: () => Promise<HardwareRecommendations>
  setRoleAssignment?: (
    input: { role: string; modelSpec: string | null },
  ) => Promise<{ success: boolean; error?: string }>
  listOllamaModels?: () => Promise<{ models: OllamaModelEntry[] }>
  pullOllamaModel?: (name: string) => Promise<{ success: boolean }>
  deleteOllamaModel?: (name: string) => Promise<{ success: boolean }>
  getOllamaEndpoint?: () => Promise<{ endpoint: string }>
  setOllamaEndpoint?: (endpoint: string | null) => Promise<{ success: boolean }>
}

// ─── Page ID Constants ────────────────────────────────────────────────────────

export const PAGE_IDS = {
  SHELL_MODE: 'shell-mode',
  ABOUT: 'about',
  API_KEYS: 'api-keys',
  MODEL_CONFIG: 'model-config',
  SYSTEM_STATUS: 'system-status',
  SETUP_WIZARD: 'setup-wizard',
  LOCAL_MODELS: 'local-models',
} as const

// ─── Settings Shell Types ─────────────────────────────────────────────────────

export interface SettingsPage {
  id: string
  label: string
  component?: React.ComponentType<SettingsPageProps>
}

export interface SettingsCategory {
  id: string
  label: string
  icon: React.ReactNode
  children?: SettingsPage[]
  defaultExpanded?: boolean
}

export interface SettingsPageProps {
  api: PreferencesApi
}

export interface SettingsNavItem {
  id: string
  label: string
  icon: React.ReactNode
  isActive: boolean
  depth: number
}

export interface SettingsNavProps {
  categories: SettingsCategory[]
  activePageId: string
  onPageSelect: (pageId: string) => void
}

export interface AppPanelEntry {
  id: string
  title: string
}

export interface AppSettingsPageProps {
  preparation: AppSettingsPreparation
  actorId: string
  onSave: (request: AppSettingsSaveRequest) => Promise<AppSettingsSaveResult>
  evidenceRefs?: string[]
}

export interface SettingsShellProps {
  api?: PreferencesApi
  appPanels?: AppPanelEntry[]
  defaultPageId?: string
  currentMode?: ShellMode
  onModeChange?: (mode: ShellMode) => void
  onWizardReset?: () => void | Promise<void>
  appSettingsContext?: Record<string, AppSettingsPageProps>
}
