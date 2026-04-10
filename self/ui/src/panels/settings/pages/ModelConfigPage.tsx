'use client'

import { useState, useEffect, useCallback } from 'react'
import type { PreferencesApi, AvailableModel, FeedbackState } from '../types'
import {
  sectionStyle,
  sectionTitleStyle,
  cardStyle,
  badgeStyle,
  btnStyle,
  selectStyle,
  feedbackStyle,
} from '../styles'
import { buildModelsByProvider, formatFeedbackError } from './helpers'

export interface ModelConfigPageProps {
  api: Pick<PreferencesApi, 'getAvailableModels' | 'getRoleAssignments' | 'setRoleAssignment'>
}

export function ModelConfigPage({ api }: ModelConfigPageProps) {
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [currentPrincipal, setCurrentPrincipal] = useState<string | null>(null)
  const [currentSystem, setCurrentSystem] = useState<string | null>(null)
  const [pendingPrincipal, setPendingPrincipal] = useState<string>('')
  const [pendingSystem, setPendingSystem] = useState<string>('')
  const [savingModels, setSavingModels] = useState(false)
  const [modelFeedback, setModelFeedback] = useState<FeedbackState | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [modelsResult, assignmentsResult] = await Promise.all([
        api.getAvailableModels ? api.getAvailableModels() : Promise.resolve(null),
        api.getRoleAssignments ? api.getRoleAssignments() : Promise.resolve(null),
      ])

      if (modelsResult) {
        setAvailableModels(modelsResult.models)
      }

      if (assignmentsResult && Array.isArray(assignmentsResult)) {
        const principalEntry = assignmentsResult.find((a: any) => a.role === 'cortex-chat')
        const systemEntry = assignmentsResult.find((a: any) => a.role === 'cortex-system')
        setCurrentPrincipal(principalEntry?.providerId ?? null)
        setCurrentSystem(systemEntry?.providerId ?? null)
        // Minimal rewire: pending values start empty; user reselects from dropdown.
        // The getRoleAssignments returns providerIds, not modelSpecs, so we cannot
        // pre-populate the dropdown (which expects modelSpec strings) without a
        // reverse lookup. This is acceptable for 1.1's minimal rewire mandate.
      }
    } catch (err) {
      setModelFeedback(formatFeedbackError(err))
    }
  }, [api])

  useEffect(() => {
    void loadData()
  }, [loadData])

  if (!api.getAvailableModels) {
    return null
  }

  const modelsByProvider = buildModelsByProvider(availableModels)

  const modelSelectionChanged =
    pendingPrincipal !== (currentPrincipal ?? '') ||
    pendingSystem !== (currentSystem ?? '')

  const handleSaveModels = async () => {
    if (!api.setRoleAssignment) return
    setSavingModels(true)
    setModelFeedback(null)
    try {
      if (pendingPrincipal) {
        await api.setRoleAssignment({ role: 'cortex-chat', modelSpec: pendingPrincipal })
      }
      if (pendingSystem) {
        await api.setRoleAssignment({ role: 'cortex-system', modelSpec: pendingSystem })
      }
      setCurrentPrincipal(pendingPrincipal || null)
      setCurrentSystem(pendingSystem || null)
      setModelFeedback({ message: 'Model selection saved.', success: true })
    } catch (err) {
      setModelFeedback(formatFeedbackError(err))
    } finally {
      setSavingModels(false)
    }
  }

  return (
    <div data-testid="settings-page-model-config">
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
    </div>
  )
}
