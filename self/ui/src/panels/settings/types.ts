import type React from 'react'
import type {
  AppSettingsPreparation,
  AppSettingsSaveRequest,
  AppSettingsSaveResult,
} from '@nous/shared'

// ─── Import and re-export from shell types (canonical ShellMode) ──────────────

import type { ShellMode } from '../../components/shell/types'
export type { ShellMode } from '../../components/shell/types'

// ─── Canonical types (primary definitions — formerly in PreferencesPanel.tsx) ──

export type Provider = 'anthropic' | 'openai'

export interface ApiKeyEntry {
  provider: Provider
  configured: boolean
  maskedKey: string | null
  createdAt: string | null
}

export interface OllamaInfo {
  running: boolean
  models: string[]
}

export interface SystemStatus {
  ollama: OllamaInfo
  configuredProviders: string[]
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
  available: boolean
}

export interface ModelSelection {
  principal: string | null
  system: string | null
}

export interface RoleAssignmentDisplayEntry {
  role: string
  providerId: string | null
}

export interface HydratedRoleAssignmentDisplayEntry extends RoleAssignmentDisplayEntry {
  displayName?: string | null
  modelSpec?: string | null
}

export type RoleAssignmentState = Record<ModelRole, HydratedRoleAssignmentDisplayEntry>
export type PendingRoleAssignments = Record<ModelRole, string>

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

/** API surface the host must provide via panel params. */
export interface PreferencesApi {
  getApiKeys: () => Promise<ApiKeyEntry[]>
  setApiKey: (input: { provider: Provider; key: string }) => Promise<{ stored: boolean }>
  deleteApiKey: (input: { provider: Provider }) => Promise<{ deleted: boolean }>
  testApiKey: (input: { provider: Provider; key?: string }) => Promise<TestResult>
  getSystemStatus: () => Promise<SystemStatus>
  resetWizard?: () => Promise<unknown>
  getAvailableModels?: () => Promise<{ models: AvailableModel[] }>
  getModelSelection?: () => Promise<ModelSelection>
  setModelSelection?: (input: { principal?: string; system?: string }) => Promise<{ success: boolean }>
  getRoleAssignments?: () => Promise<RoleAssignmentDisplayEntry[]>
  getHardwareRecommendations?: () => Promise<HardwareRecommendations>
  setRoleAssignment?: (
    input: { role: string; modelSpec: string },
  ) => Promise<{ success: boolean; error?: string }>
}

// ─── Constants ─────────────────────────────────────────────────────────────────

export const MODEL_ROLES = [
  'orchestrator',
  'reasoner',
  'tool-advisor',
  'summarizer',
  'embedder',
  'reranker',
  'vision',
] as const

export type ModelRole = typeof MODEL_ROLES[number]

export const MODEL_ROLE_LABELS: Record<ModelRole, string> = {
  orchestrator: 'Orchestrator',
  reasoner: 'Reasoner',
  'tool-advisor': 'Tool Advisor',
  summarizer: 'Summarizer',
  embedder: 'Embedder',
  reranker: 'Reranker',
  vision: 'Vision',
}

export const MODEL_ROLE_HINTS: Record<ModelRole, string> = {
  orchestrator: 'Prefer the fastest model available for low-latency coordination.',
  reasoner: 'Prefer the strongest model your current setup can comfortably sustain.',
  'tool-advisor': 'Use a balanced model that stays responsive while calling tools.',
  summarizer: 'A fast mid-tier model is usually enough for condensation passes.',
  embedder: 'A lightweight local model keeps indexing and retrieval work snappy.',
  reranker: 'Favor the quickest model that still preserves useful ranking quality.',
  vision: 'Choose a multimodal-capable model when one is available.',
}

// ─── Page ID Constants ────────────────────────────────────────────────────────

export const PAGE_IDS = {
  SHELL_MODE: 'shell-mode',
  ABOUT: 'about',
  API_KEYS: 'api-keys',
  MODEL_CONFIG: 'model-config',
  ROLE_ASSIGNMENTS: 'role-assignments',
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
