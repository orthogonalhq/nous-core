'use client'

import { useState, useEffect, useCallback } from 'react'
import type { IDockviewPanelProps } from 'dockview-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Provider = 'anthropic' | 'openai'
type ModelRole = typeof MODEL_ROLES[number]

interface ApiKeyEntry {
  provider: Provider
  configured: boolean
  maskedKey: string | null
  createdAt: string | null
}

interface OllamaInfo {
  running: boolean
  models: string[]
}

interface SystemStatus {
  ollama: OllamaInfo
  configuredProviders: string[]
  credentialVaultHealthy: boolean
}

interface TestResult {
  valid: boolean
  error: string | null
}

interface FeedbackState {
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

interface HydratedRoleAssignmentDisplayEntry extends RoleAssignmentDisplayEntry {
  displayName?: string | null
  modelSpec?: string | null
}

type RoleAssignmentState = Record<ModelRole, HydratedRoleAssignmentDisplayEntry>
type PendingRoleAssignments = Record<ModelRole, string>

interface RecommendedModel {
  modelSpec: string
  displayName: string
  reason: string
}

interface RoleModelRecommendation {
  role: ModelRole
  recommendation: RecommendedModel
}

interface HardwareRecommendations {
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
  getAvailableModels?: () => Promise<{ models: AvailableModel[] }>
  getModelSelection?: () => Promise<ModelSelection>
  setModelSelection?: (input: { principal?: string; system?: string }) => Promise<{ success: boolean }>
  getRoleAssignments?: () => Promise<RoleAssignmentDisplayEntry[]>
  getHardwareRecommendations?: () => Promise<HardwareRecommendations>
  setRoleAssignment?: (
    input: { role: string; modelSpec: string },
  ) => Promise<{ success: boolean; error?: string }>
}

interface PreferencesPanelProps extends IDockviewPanelProps {
  params: {
    preferencesApi?: PreferencesApi
  }
}

const MODEL_ROLES = [
  'orchestrator',
  'reasoner',
  'tool-advisor',
  'summarizer',
  'embedder',
  'reranker',
  'vision',
] as const

const MODEL_ROLE_LABELS: Record<ModelRole, string> = {
  orchestrator: 'Orchestrator',
  reasoner: 'Reasoner',
  'tool-advisor': 'Tool Advisor',
  summarizer: 'Summarizer',
  embedder: 'Embedder',
  reranker: 'Reranker',
  vision: 'Vision',
}

const MODEL_ROLE_HINTS: Record<ModelRole, string> = {
  orchestrator: 'Prefer the fastest model available for low-latency coordination.',
  reasoner: 'Prefer the strongest model your current setup can comfortably sustain.',
  'tool-advisor': 'Use a balanced model that stays responsive while calling tools.',
  summarizer: 'A fast mid-tier model is usually enough for condensation passes.',
  embedder: 'A lightweight local model keeps indexing and retrieval work snappy.',
  reranker: 'Favor the quickest model that still preserves useful ranking quality.',
  vision: 'Choose a multimodal-capable model when one is available.',
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sectionStyle: React.CSSProperties = {
  marginBottom: 'var(--nous-space-2xl)',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-lg)',
  fontWeight: 'var(--nous-font-weight-semibold)' as never,
  color: 'var(--nous-fg)',
  marginBottom: 'var(--nous-space-lg)',
  paddingBottom: 'var(--nous-space-sm)',
  borderBottom: '1px solid var(--nous-header-border)',
}

const cardStyle: React.CSSProperties = {
  background: 'var(--nous-bg-elevated)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-lg)',
  marginBottom: 'var(--nous-space-md)',
  border: '1px solid var(--nous-header-border)',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-md)',
}

const badgeStyle = (configured: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: 'var(--nous-radius-sm)',
  fontSize: 'var(--nous-font-size-xs)',
  fontWeight: 'var(--nous-font-weight-medium)' as never,
  background: configured ? 'var(--nous-state-active)' : 'var(--nous-bg)',
  color: configured ? 'var(--nous-fg-on-color)' : 'var(--nous-fg-subtle)',
  border: configured ? 'none' : '1px solid var(--nous-header-border)',
})

const btnStyle = (variant: 'primary' | 'danger' | 'ghost'): React.CSSProperties => ({
  padding: 'var(--nous-space-sm) var(--nous-space-lg)',
  borderRadius: 'var(--nous-radius-md)',
  border: variant === 'ghost' ? '1px solid var(--nous-header-border)' : 'none',
  background:
    variant === 'primary'
      ? 'var(--nous-btn-primary-bg)'
      : variant === 'danger'
        ? 'var(--nous-state-blocked)'
        : 'transparent',
  color: variant === 'ghost' ? 'var(--nous-fg-muted)' : 'var(--nous-fg-on-color)',
  cursor: 'pointer',
  fontSize: 'var(--nous-font-size-sm)',
  fontWeight: 'var(--nous-font-weight-medium)' as never,
})

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: 'var(--nous-input-bg)',
  border: '1px solid var(--nous-header-border)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
  outline: 'none',
  fontFamily: 'monospace',
}

const selectStyle: React.CSSProperties = {
  background: 'var(--nous-input-bg)',
  border: '1px solid var(--nous-header-border)',
  borderRadius: 'var(--nous-radius-md)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  color: 'var(--nous-fg)',
  fontSize: 'var(--nous-font-size-sm)',
  outline: 'none',
}

const feedbackStyle = (success: boolean): React.CSSProperties => ({
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  borderRadius: 'var(--nous-radius-sm)',
  fontSize: 'var(--nous-font-size-sm)',
  background: success ? 'var(--nous-state-active)' : 'var(--nous-state-blocked)',
  color: 'var(--nous-fg-on-color)',
  marginTop: 'var(--nous-space-sm)',
})

const helperTextStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)',
  color: 'var(--nous-fg-subtle)',
}

const roleGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
  gap: 'var(--nous-space-md)',
  marginTop: 'var(--nous-space-lg)',
}

const roleCardStyle: React.CSSProperties = {
  background: 'var(--nous-surface)',
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-header-border)',
  padding: 'var(--nous-space-lg)',
  display: 'grid',
  gap: 'var(--nous-space-sm)',
}

const roleCurrentLabelStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-xs)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--nous-fg-subtle)',
}

const roleCurrentValueStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-fg)',
  fontWeight: 'var(--nous-font-weight-medium)' as never,
}

const applyAllRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--nous-space-sm)',
  alignItems: 'center',
  marginTop: 'var(--nous-space-md)',
}

const actionRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 'var(--nous-space-sm)',
  marginTop: 'var(--nous-space-lg)',
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
}

export async function testStoredProviderKey(
  api: PreferencesApi,
  provider: Provider,
): Promise<FeedbackState> {
  const result = await api.testApiKey({ provider })
  if (result.valid) {
    return {
      message: `${PROVIDER_LABELS[provider]} API key is valid.`,
      success: true,
    }
  }

  return {
    message: result.error ?? `${PROVIDER_LABELS[provider]} API key test failed.`,
    success: false,
  }
}

export function formatFeedbackError(error: unknown): FeedbackState {
  const message = error instanceof Error ? error.message : String(error)
  return {
    message: `Error: ${message}`,
    success: false,
  }
}

function isModelRole(role: string): role is ModelRole {
  return MODEL_ROLES.some((value) => value === role)
}

function buildEmptyRoleAssignments(): RoleAssignmentState {
  return MODEL_ROLES.reduce<RoleAssignmentState>((result, role) => {
    result[role] = {
      role,
      providerId: null,
      displayName: null,
      modelSpec: null,
    }
    return result
  }, {} as RoleAssignmentState)
}

function buildPendingRoleAssignments(
  roleAssignments: RoleAssignmentState,
): PendingRoleAssignments {
  return MODEL_ROLES.reduce<PendingRoleAssignments>((result, role) => {
    result[role] = roleAssignments[role].modelSpec ?? ''
    return result
  }, {} as PendingRoleAssignments)
}

function normalizeRoleAssignmentEntries(
  entries: RoleAssignmentDisplayEntry[],
): RoleAssignmentState {
  const next = buildEmptyRoleAssignments()

  for (const entry of entries as HydratedRoleAssignmentDisplayEntry[]) {
    if (!isModelRole(entry.role)) {
      continue
    }

    next[entry.role] = {
      role: entry.role,
      providerId: entry.providerId ?? null,
      displayName: entry.displayName ?? null,
      modelSpec: entry.modelSpec ?? null,
    }
  }

  return next
}

function buildModelsByProvider(
  models: AvailableModel[],
): Record<string, AvailableModel[]> {
  return models.reduce<Record<string, AvailableModel[]>>((result, model) => {
    const group = result[model.provider] ?? []
    group.push(model)
    result[model.provider] = group
    return result
  }, {})
}

function getModelOptionLabel(model: AvailableModel): string {
  return model.available ? model.name : `${model.name} (cached)`
}

function getRoleAssignmentDisplay(
  entry: HydratedRoleAssignmentDisplayEntry,
  models: AvailableModel[],
): string {
  if (entry.modelSpec) {
    const matchingModel = models.find((model) => model.id === entry.modelSpec)
    return matchingModel?.name ?? entry.displayName ?? entry.modelSpec
  }

  if (entry.displayName) {
    return entry.displayName
  }

  if (entry.providerId) {
    return entry.providerId
  }

  return 'Not assigned'
}

function buildChangedRoleAssignments(
  roleAssignments: RoleAssignmentState,
  pendingRoleAssignments: PendingRoleAssignments,
): Array<{ role: ModelRole; modelSpec: string }> {
  return MODEL_ROLES.flatMap((role) => {
    const currentModelSpec = roleAssignments[role].modelSpec ?? ''
    const nextModelSpec = pendingRoleAssignments[role]

    if (!nextModelSpec || nextModelSpec === currentModelSpec) {
      return []
    }

    return [{ role, modelSpec: nextModelSpec }]
  })
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PreferencesPanel({ params }: PreferencesPanelProps) {
  const api = params?.preferencesApi

  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [loading, setLoading] = useState(true)

  // Add key form
  const [addProvider, setAddProvider] = useState<Provider>('anthropic')
  const [addKey, setAddKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  // Per-provider testing state
  const [testingProvider, setTestingProvider] = useState<Provider | null>(null)

  // Model selection state
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [modelSelection, setModelSelection] = useState<ModelSelection>({ principal: null, system: null })
  const [pendingPrincipal, setPendingPrincipal] = useState<string>('')
  const [pendingSystem, setPendingSystem] = useState<string>('')
  const [savingModels, setSavingModels] = useState(false)
  const [modelFeedback, setModelFeedback] = useState<FeedbackState | null>(null)
  const [hardwareRecommendations, setHardwareRecommendations] =
    useState<HardwareRecommendations | null>(null)

  // Role assignment state
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignmentState>(
    () => buildEmptyRoleAssignments(),
  )
  const [pendingRoleAssignments, setPendingRoleAssignments] = useState<PendingRoleAssignments>(
    () => buildPendingRoleAssignments(buildEmptyRoleAssignments()),
  )
  const [applyAllRoleModel, setApplyAllRoleModel] = useState('')
  const [savingRoleAssignments, setSavingRoleAssignments] = useState(false)
  const [roleAssignmentFeedback, setRoleAssignmentFeedback] = useState<FeedbackState | null>(null)

  const refresh = useCallback(async () => {
    if (!api) return
    try {
      const [keys, status, modelsResult, selectionResult, roleEntries, recommendationResult] = await Promise.all([
        api.getApiKeys(),
        api.getSystemStatus(),
        api.getAvailableModels ? api.getAvailableModels() : Promise.resolve(null),
        api.getModelSelection ? api.getModelSelection() : Promise.resolve(null),
        api.getRoleAssignments ? api.getRoleAssignments() : Promise.resolve(null),
        api.getHardwareRecommendations ? api.getHardwareRecommendations() : Promise.resolve(null),
      ])
      setApiKeys(keys)
      setSystemStatus(status)

      if (modelsResult) {
        setAvailableModels(modelsResult.models)
      }

      if (selectionResult) {
        setModelSelection(selectionResult)
        setPendingPrincipal(selectionResult.principal ?? '')
        setPendingSystem(selectionResult.system ?? '')
      }

      if (roleEntries) {
        const normalizedAssignments = normalizeRoleAssignmentEntries(roleEntries)
        setRoleAssignments(normalizedAssignments)
        setPendingRoleAssignments(buildPendingRoleAssignments(normalizedAssignments))
      }

      if (recommendationResult) {
        setHardwareRecommendations(recommendationResult)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleSaveAndTest = async () => {
    if (!api || !addKey.trim()) return
    setSaving(true)
    setFeedback(null)
    try {
      // Test first
      const testResult = await api.testApiKey({ provider: addProvider, key: addKey.trim() })
      if (!testResult.valid) {
        setFeedback({ message: `Invalid key: ${testResult.error ?? 'unknown error'}`, success: false })
        setSaving(false)
        return
      }
      // Store
      await api.setApiKey({ provider: addProvider, key: addKey.trim() })
      setFeedback({ message: `${PROVIDER_LABELS[addProvider]} API key saved and verified.`, success: true })
      setAddKey('')
      await refresh()
    } catch (err) {
      setFeedback(formatFeedbackError(err))
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (provider: Provider) => {
    if (!api) return
    setTestingProvider(provider)
    setFeedback(null)
    try {
      setFeedback(await testStoredProviderKey(api, provider))
    } catch (err) {
      setFeedback(formatFeedbackError(err))
    } finally {
      setTestingProvider(null)
    }
  }

  const handleDelete = async (provider: Provider) => {
    if (!api) return
    try {
      await api.deleteApiKey({ provider })
      setFeedback({ message: `${PROVIDER_LABELS[provider]} API key deleted.`, success: true })
      await refresh()
    } catch (err) {
      setFeedback(formatFeedbackError(err))
    }
  }

  const handleSaveModels = async () => {
    if (!api?.setModelSelection) return
    setSavingModels(true)
    setModelFeedback(null)
    try {
      await api.setModelSelection({
        principal: pendingPrincipal || undefined,
        system: pendingSystem || undefined,
      })
      setModelSelection({
        principal: pendingPrincipal || null,
        system: pendingSystem || null,
      })
      setModelFeedback({ message: 'Model selection saved.', success: true })
    } catch (err) {
      setModelFeedback(formatFeedbackError(err))
    } finally {
      setSavingModels(false)
    }
  }

  const handleSaveRoleAssignments = async () => {
    if (!api?.setRoleAssignment) return

    const updates = buildChangedRoleAssignments(roleAssignments, pendingRoleAssignments)
    if (updates.length === 0) {
      return
    }

    setSavingRoleAssignments(true)
    setRoleAssignmentFeedback(null)

    try {
      const results = await Promise.all(
        updates.map((update) => api.setRoleAssignment!({
          role: update.role,
          modelSpec: update.modelSpec,
        })),
      )
      const failure = results.find((result) => !result.success)

      if (failure) {
        throw new Error(failure.error ?? 'Role assignment update failed.')
      }

      await refresh()
      setRoleAssignmentFeedback({
        message:
          updates.length === 1
            ? `${MODEL_ROLE_LABELS[updates[0]!.role]} assignment saved.`
            : `Saved ${updates.length} role assignments.`,
        success: true,
      })
    } catch (err) {
      setRoleAssignmentFeedback(formatFeedbackError(err))
    } finally {
      setSavingRoleAssignments(false)
    }
  }

  const handleApplyToAllRoles = async () => {
    if (!api?.setRoleAssignment || !applyAllRoleModel) return

    setSavingRoleAssignments(true)
    setRoleAssignmentFeedback(null)

    try {
      const results = await Promise.all(
        MODEL_ROLES.map((role) => api.setRoleAssignment!({
          role,
          modelSpec: applyAllRoleModel,
        })),
      )
      const failure = results.find((result) => !result.success)

      if (failure) {
        throw new Error(failure.error ?? 'Bulk role assignment failed.')
      }

      await refresh()
      setRoleAssignmentFeedback({
        message: 'Applied the selected model to all seven roles.',
        success: true,
      })
    } catch (err) {
      setRoleAssignmentFeedback(formatFeedbackError(err))
    } finally {
      setSavingRoleAssignments(false)
    }
  }

  const modelSelectionChanged =
    pendingPrincipal !== (modelSelection.principal ?? '') ||
    pendingSystem !== (modelSelection.system ?? '')

  const modelsByProvider = buildModelsByProvider(availableModels)
  const changedRoleAssignments = buildChangedRoleAssignments(
    roleAssignments,
    pendingRoleAssignments,
  )

  if (!api) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--nous-fg-subtle)' }}>
        Preferences API not connected.
      </div>
    )
  }

  if (loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--nous-fg-subtle)' }}>
        Loading preferences...
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 'var(--nous-space-2xl)', color: 'var(--nous-fg)' }}>
      {/* ── API Keys ─────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>API Keys</div>

        {apiKeys.map((entry) => (
          <div key={entry.provider} style={cardStyle}>
            <div style={rowStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-md)' }}>
                <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never, fontSize: 'var(--nous-font-size-base)' }}>
                  {PROVIDER_LABELS[entry.provider]}
                </span>
                <span style={badgeStyle(entry.configured)}>
                  {entry.configured ? 'Configured' : 'Not configured'}
                </span>
              </div>
              {entry.configured && (
                <div style={{ display: 'flex', gap: 'var(--nous-space-sm)' }}>
                  <button
                    style={btnStyle('ghost')}
                    onClick={() => handleTest(entry.provider)}
                    disabled={testingProvider === entry.provider}
                  >
                    {testingProvider === entry.provider ? 'Testing...' : 'Test'}
                  </button>
                  <button
                    style={btnStyle('danger')}
                    onClick={() => handleDelete(entry.provider)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            {entry.configured && entry.maskedKey && (
              <div style={{ marginTop: 'var(--nous-space-sm)', fontFamily: 'monospace', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
                {entry.maskedKey}
              </div>
            )}
            {entry.configured && entry.createdAt && (
              <div style={{ marginTop: 'var(--nous-space-xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)' }}>
                Added {new Date(entry.createdAt).toLocaleDateString()}
              </div>
            )}
          </div>
        ))}

        {/* Add API Key form */}
        <div style={{ ...cardStyle, marginTop: 'var(--nous-space-lg)' }}>
          <div style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 'var(--nous-font-weight-medium)' as never, marginBottom: 'var(--nous-space-md)', color: 'var(--nous-fg-muted)' }}>
            Add API Key
          </div>
          <div style={{ display: 'flex', gap: 'var(--nous-space-sm)', alignItems: 'center' }}>
            <select
              style={selectStyle}
              value={addProvider}
              onChange={(e) => setAddProvider(e.target.value as Provider)}
            >
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
            <input
              type="password"
              style={inputStyle}
              value={addKey}
              onChange={(e) => setAddKey(e.target.value)}
              placeholder="Paste your API key..."
            />
            <button
              style={{
                ...btnStyle('primary'),
                opacity: saving || !addKey.trim() ? 0.5 : 1,
                cursor: saving || !addKey.trim() ? 'not-allowed' : 'pointer',
              }}
              onClick={handleSaveAndTest}
              disabled={saving || !addKey.trim()}
            >
              {saving ? 'Saving...' : 'Save & Test'}
            </button>
          </div>
        </div>

        {feedback && (
          <div style={feedbackStyle(feedback.success)}>
            {feedback.message}
          </div>
        )}
      </div>

      {/* ── Model Configuration ─────────────────────────────── */}
      {api.getAvailableModels && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Model Configuration</div>

          <div style={cardStyle}>
            <div style={{ marginBottom: 'var(--nous-space-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)', marginBottom: 'var(--nous-space-xs)' }}>
                <label
                  htmlFor="principal-model-select"
                  style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never, fontSize: 'var(--nous-font-size-base)' }}
                >
                  Cortex::Principal
                </label>
                <span style={badgeStyle(false)}>Thinking &amp; Reasoning</span>
              </div>
              <div style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', marginBottom: 'var(--nous-space-sm)' }}>
                Powers deep thinking, planning, and complex reasoning. Recommend highest-capability model.
              </div>
              <select
                id="principal-model-select"
                style={{ ...selectStyle, width: '100%' }}
                value={pendingPrincipal}
                onChange={(e) => setPendingPrincipal(e.target.value)}
              >
                <option value="">Auto-detect (best available)</option>
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                    {models.filter((m) => m.available).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 'var(--nous-space-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)', marginBottom: 'var(--nous-space-xs)' }}>
                <label
                  htmlFor="system-model-select"
                  style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never, fontSize: 'var(--nous-font-size-base)' }}
                >
                  Cortex::System
                </label>
                <span style={badgeStyle(false)}>Orchestration</span>
              </div>
              <div style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', marginBottom: 'var(--nous-space-sm)' }}>
                Handles fast orchestration, routing, and coordination tasks. Recommend fastest model.
              </div>
              <select
                id="system-model-select"
                style={{ ...selectStyle, width: '100%' }}
                value={pendingSystem}
                onChange={(e) => setPendingSystem(e.target.value)}
              >
                <option value="">Auto-detect (fastest available)</option>
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <optgroup key={provider} label={provider.charAt(0).toUpperCase() + provider.slice(1)}>
                    {models.filter((m) => m.available).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {availableModels.length === 0 && (
              <div style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-subtle)', marginBottom: 'var(--nous-space-md)' }}>
                No models available. Start Ollama or configure an API key above.
              </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--nous-space-sm)', alignItems: 'center' }}>
              <button
                style={{
                  ...btnStyle('primary'),
                  opacity: savingModels || !modelSelectionChanged ? 0.5 : 1,
                  cursor: savingModels || !modelSelectionChanged ? 'not-allowed' : 'pointer',
                }}
                onClick={handleSaveModels}
                disabled={savingModels || !modelSelectionChanged}
              >
                {savingModels ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>

          {modelFeedback && (
            <div style={feedbackStyle(modelFeedback.success)}>
              {modelFeedback.message}
            </div>
          )}
        </div>
      )}

      {/* ── Role Assignments ─────────────────────────────── */}
      {api.getRoleAssignments && (
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>Role Assignments</div>

          <div style={cardStyle}>
            <div
              style={{
                fontSize: 'var(--nous-font-size-base)',
                fontWeight: 'var(--nous-font-weight-semibold)' as never,
                color: 'var(--nous-fg)',
              }}
            >
              Ongoing 7-role routing
            </div>
            <div style={{ ...helperTextStyle, marginTop: 'var(--nous-space-xs)' }}>
              Adjust the model used by each cortex role after onboarding. Use the shortcut below
              when you want to standardize on one model across the entire runtime.
            </div>
            {hardwareRecommendations?.advisory && (
              <div style={{ ...helperTextStyle, marginTop: 'var(--nous-space-sm)' }}>
                {hardwareRecommendations.advisory}
              </div>
            )}

            <div style={applyAllRowStyle}>
              <select
                id="apply-all-roles-select"
                aria-label="Apply one model to every role"
                style={{ ...selectStyle, minWidth: '260px', flex: '1 1 260px' }}
                value={applyAllRoleModel}
                onChange={(event) => {
                  setApplyAllRoleModel(event.target.value)
                  setRoleAssignmentFeedback(null)
                }}
              >
                <option value="">Choose a model for all roles</option>
                {Object.entries(modelsByProvider).map(([provider, models]) => (
                  <optgroup
                    key={`apply-all-${provider}`}
                    label={provider.charAt(0).toUpperCase() + provider.slice(1)}
                  >
                    {models.map((model) => (
                      <option key={`apply-all-${model.id}`} value={model.id}>
                        {getModelOptionLabel(model)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <button
                style={{
                  ...btnStyle('ghost'),
                  opacity:
                    savingRoleAssignments || !applyAllRoleModel || availableModels.length === 0
                      ? 0.5
                      : 1,
                  cursor:
                    savingRoleAssignments || !applyAllRoleModel || availableModels.length === 0
                      ? 'not-allowed'
                      : 'pointer',
                }}
                onClick={handleApplyToAllRoles}
                disabled={savingRoleAssignments || !applyAllRoleModel || availableModels.length === 0}
              >
                Apply to All Roles
              </button>
            </div>

            {hardwareRecommendations?.singleModel && (
              <div style={{ ...helperTextStyle, marginTop: 'var(--nous-space-sm)' }}>
                Machine recommendation: {hardwareRecommendations.singleModel.displayName} — {hardwareRecommendations.singleModel.reason}
              </div>
            )}

            {availableModels.length === 0 && (
              <div style={{ ...helperTextStyle, marginTop: 'var(--nous-space-md)' }}>
                No models are available yet. Start Ollama or configure a provider to update role
                assignments.
              </div>
            )}

            <div style={roleGridStyle}>
              {MODEL_ROLES.map((role) => {
                const roleRecommendation = hardwareRecommendations?.multiModel.find(
                  (recommendation) => recommendation.role === role,
                )

                return (
                  <div key={role} style={roleCardStyle}>
                    <div style={rowStyle}>
                      <div>
                        <div
                          style={{
                            fontSize: 'var(--nous-font-size-base)',
                            fontWeight: 'var(--nous-font-weight-semibold)' as never,
                            color: 'var(--nous-fg)',
                          }}
                        >
                          {MODEL_ROLE_LABELS[role]}
                        </div>
                        <div style={{ ...helperTextStyle, marginTop: 'var(--nous-space-xs)' }}>
                          {roleRecommendation
                            ? `Recommended: ${roleRecommendation.recommendation.displayName} — ${roleRecommendation.recommendation.reason}`
                            : MODEL_ROLE_HINTS[role]}
                        </div>
                      </div>
                      <span style={badgeStyle(Boolean(roleAssignments[role].providerId))}>
                        {roleAssignments[role].providerId ? 'Assigned' : 'Not assigned'}
                      </span>
                    </div>

                    <div style={roleCurrentLabelStyle}>Current model</div>
                    <div style={roleCurrentValueStyle}>
                      {getRoleAssignmentDisplay(roleAssignments[role], availableModels)}
                    </div>

                    <label
                      htmlFor={`role-assignment-${role}`}
                      style={{ ...helperTextStyle, color: 'var(--nous-fg-muted)' }}
                    >
                      Next assignment
                    </label>
                    <select
                      id={`role-assignment-${role}`}
                      aria-label={`${MODEL_ROLE_LABELS[role]} assignment`}
                      style={{ ...selectStyle, width: '100%' }}
                      value={pendingRoleAssignments[role]}
                      disabled={availableModels.length === 0 || savingRoleAssignments}
                      onChange={(event) => {
                        const nextValue = event.target.value
                        setPendingRoleAssignments((current) => ({
                          ...current,
                          [role]: nextValue,
                        }))
                        setRoleAssignmentFeedback(null)
                      }}
                    >
                      <option value="">
                        {roleAssignments[role].modelSpec ? 'Select a replacement model' : 'Select a model'}
                      </option>
                      {Object.entries(modelsByProvider).map(([provider, models]) => (
                        <optgroup
                          key={`${role}-${provider}`}
                          label={provider.charAt(0).toUpperCase() + provider.slice(1)}
                        >
                          {models.map((model) => (
                            <option key={`${role}-${model.id}`} value={model.id}>
                              {getModelOptionLabel(model)}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )
              })}
            </div>

            <div style={actionRowStyle}>
              <button
                style={{
                  ...btnStyle('primary'),
                  opacity:
                    savingRoleAssignments ||
                    changedRoleAssignments.length === 0 ||
                    !api.setRoleAssignment
                      ? 0.5
                      : 1,
                  cursor:
                    savingRoleAssignments ||
                    changedRoleAssignments.length === 0 ||
                    !api.setRoleAssignment
                      ? 'not-allowed'
                      : 'pointer',
                }}
                onClick={handleSaveRoleAssignments}
                disabled={
                  savingRoleAssignments ||
                  changedRoleAssignments.length === 0 ||
                  !api.setRoleAssignment
                }
              >
                {savingRoleAssignments ? 'Saving...' : 'Save Role Assignments'}
              </button>
            </div>
          </div>

          {roleAssignmentFeedback && (
            <div style={feedbackStyle(roleAssignmentFeedback.success)}>
              {roleAssignmentFeedback.message}
            </div>
          )}
        </div>
      )}

      {/* ── System Status ─────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>System Status</div>

        <div style={cardStyle}>
          <div style={{ ...rowStyle, marginBottom: 'var(--nous-space-md)' }}>
            <span>Ollama</span>
            <span style={badgeStyle(systemStatus?.ollama.running ?? false)}>
              {systemStatus?.ollama.running ? 'Running' : 'Not running'}
            </span>
          </div>
          {systemStatus?.ollama.running && systemStatus.ollama.models.length > 0 && (
            <div style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              Models: {systemStatus.ollama.models.join(', ')}
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={rowStyle}>
            <span>Active Providers</span>
            <span style={{ fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              {systemStatus?.configuredProviders.length
                ? systemStatus.configuredProviders.map((p) => PROVIDER_LABELS[p as Provider] ?? p).join(', ')
                : 'None'}
            </span>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={rowStyle}>
            <span>Credential Vault</span>
            <span style={badgeStyle(systemStatus?.credentialVaultHealthy ?? false)}>
              {systemStatus?.credentialVaultHealthy ? 'Healthy' : 'Unavailable'}
            </span>
          </div>
        </div>
      </div>

      {/* ── About ─────────────────────────────────────────── */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>About</div>

        <div style={cardStyle}>
          <div style={{ marginBottom: 'var(--nous-space-md)' }}>
            <span style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never }}>Nous</span>
            <span style={{ marginLeft: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
              v0.1.0
            </span>
          </div>
          <div style={{ display: 'flex', gap: 'var(--nous-space-lg)', fontSize: 'var(--nous-font-size-sm)' }}>
            <a
              href="https://github.com/nousai/nous-core"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--nous-btn-primary-bg)', textDecoration: 'underline' }}
            >
              GitHub
            </a>
            <a
              href="https://docs.nous.ai"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--nous-btn-primary-bg)', textDecoration: 'underline' }}
            >
              Documentation
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
