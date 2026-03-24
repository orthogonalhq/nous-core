import type React from 'react'

// ─── Re-exports from PreferencesPanel ─────────────────────────────────────────

export type { PreferencesApi, AvailableModel, ModelSelection, RoleAssignmentDisplayEntry } from '../PreferencesPanel'

// ─── Re-export from shell types (canonical ShellMode) ─────────────────────────

export type { ShellMode } from '../../components/shell/types'

// ─── Internal types (copied from PreferencesPanel.tsx L8-79) ──────────────────

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

export interface HydratedRoleAssignmentDisplayEntry {
  role: string
  providerId: string | null
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

// ─── Constants (copied from PreferencesPanel.tsx L110-138) ────────────────────

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

// ─── New Settings Shell Types ─────────────────────────────────────────────────

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

export interface SettingsShellProps {
  api?: PreferencesApi
  appPanels?: AppPanelEntry[]
  defaultPageId?: string
}

// Need to import PreferencesApi for use in interface definitions above
// (type-only import is already handled via re-export)
import type { PreferencesApi } from '../PreferencesPanel'
