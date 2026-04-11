'use client'

import { useState, useEffect, useCallback } from 'react'
import { ModelRoleSchema, MODEL_ROLE_LABELS, MODEL_ROLE_HINTS } from '@nous/shared'
import type { ModelRole } from '@nous/shared'
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

type RoleValues = Record<ModelRole, string | null>
type PendingValues = Record<ModelRole, string>

function emptyRoleValues(): RoleValues {
  return ModelRoleSchema.options.reduce<RoleValues>((acc, role) => {
    acc[role] = null
    return acc
  }, {} as RoleValues)
}

function emptyPendingValues(): PendingValues {
  return ModelRoleSchema.options.reduce<PendingValues>((acc, role) => {
    acc[role] = ''
    return acc
  }, {} as PendingValues)
}

export function ModelConfigPage({ api }: ModelConfigPageProps) {
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [currentValues, setCurrentValues] = useState<RoleValues>(emptyRoleValues)
  const [pendingValues, setPendingValues] = useState<PendingValues>(emptyPendingValues)
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
        const nextValues = emptyRoleValues()
        for (const role of ModelRoleSchema.options) {
          const entry = assignmentsResult.find((a: any) => a.role === role)
          nextValues[role] = entry?.providerId ?? null
        }
        setCurrentValues(nextValues)
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

  const modelSelectionChanged = ModelRoleSchema.options.some(
    (role) => pendingValues[role] !== (currentValues[role] ?? ''),
  )

  const handleSaveModels = async () => {
    if (!api.setRoleAssignment) return
    setSavingModels(true)
    setModelFeedback(null)
    try {
      for (const role of ModelRoleSchema.options) {
        if (pendingValues[role]) {
          await api.setRoleAssignment({ role, modelSpec: pendingValues[role] })
        }
      }
      const nextValues = emptyRoleValues()
      for (const role of ModelRoleSchema.options) {
        nextValues[role] = pendingValues[role] || null
      }
      setCurrentValues(nextValues)
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
          {ModelRoleSchema.options.map((role) => (
            <div key={role} style={{ marginBottom: 'var(--nous-space-lg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)', marginBottom: 'var(--nous-space-xs)' }}>
                <label
                  htmlFor={`role-select-${role}`}
                  style={{ fontWeight: 'var(--nous-font-weight-semibold)' as never, fontSize: 'var(--nous-font-size-base)' }}
                >
                  {MODEL_ROLE_LABELS[role]}
                </label>
                <span style={badgeStyle(false)}>{role}</span>
              </div>
              <div style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-subtle)', marginBottom: 'var(--nous-space-sm)' }}>
                {MODEL_ROLE_HINTS[role]}
              </div>
              <select
                id={`role-select-${role}`}
                style={{ ...selectStyle, width: '100%' }}
                value={pendingValues[role]}
                onChange={(e) =>
                  setPendingValues((prev) => ({ ...prev, [role]: e.target.value }))
                }
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
          ))}

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
