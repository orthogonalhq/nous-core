'use client'

import { useState, useEffect, useCallback } from 'react'
import type {
  PreferencesApi,
  AvailableModel,
  FeedbackState,
  RoleAssignmentState,
  PendingRoleAssignments,
  HardwareRecommendations,
} from '../types'
import { MODEL_ROLES, MODEL_ROLE_LABELS, MODEL_ROLE_HINTS } from '../types'
import {
  sectionStyle,
  sectionTitleStyle,
  cardStyle,
  rowStyle,
  badgeStyle,
  btnStyle,
  selectStyle,
  feedbackStyle,
  helperTextStyle,
  roleGridStyle,
  roleCardStyle,
  roleCurrentLabelStyle,
  roleCurrentValueStyle,
  applyAllRowStyle,
  actionRowStyle,
} from '../styles'
import {
  buildEmptyRoleAssignments,
  buildPendingRoleAssignments,
  normalizeRoleAssignmentEntries,
  buildModelsByProvider,
  getModelOptionLabel,
  getRoleAssignmentDisplay,
  buildChangedRoleAssignments,
  formatFeedbackError,
} from './helpers'

export interface RoleAssignmentsPageProps {
  api: Pick<PreferencesApi, 'getRoleAssignments' | 'getHardwareRecommendations' | 'setRoleAssignment' | 'getAvailableModels'>
}

export function RoleAssignmentsPage({ api }: RoleAssignmentsPageProps) {
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([])
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignmentState>(
    () => buildEmptyRoleAssignments(),
  )
  const [pendingRoleAssignments, setPendingRoleAssignments] = useState<PendingRoleAssignments>(
    () => buildPendingRoleAssignments(buildEmptyRoleAssignments()),
  )
  const [applyAllRoleModel, setApplyAllRoleModel] = useState('')
  const [savingRoleAssignments, setSavingRoleAssignments] = useState(false)
  const [roleAssignmentFeedback, setRoleAssignmentFeedback] = useState<FeedbackState | null>(null)
  const [hardwareRecommendations, setHardwareRecommendations] =
    useState<HardwareRecommendations | null>(null)

  const loadData = useCallback(async () => {
    try {
      const [modelsResult, roleEntries, recommendationResult] = await Promise.all([
        api.getAvailableModels ? api.getAvailableModels() : Promise.resolve(null),
        api.getRoleAssignments ? api.getRoleAssignments() : Promise.resolve(null),
        api.getHardwareRecommendations ? api.getHardwareRecommendations() : Promise.resolve(null),
      ])

      if (modelsResult) {
        setAvailableModels(modelsResult.models)
      }

      if (roleEntries) {
        const normalizedAssignments = normalizeRoleAssignmentEntries(roleEntries)
        setRoleAssignments(normalizedAssignments)
        setPendingRoleAssignments(buildPendingRoleAssignments(normalizedAssignments))
      }

      if (recommendationResult) {
        setHardwareRecommendations(recommendationResult)
      }
    } catch (err) {
      setRoleAssignmentFeedback(formatFeedbackError(err))
    }
  }, [api])

  useEffect(() => {
    void loadData()
  }, [loadData])

  if (!api.getRoleAssignments) {
    return null
  }

  const modelsByProvider = buildModelsByProvider(availableModels)
  const changedRoleAssignments = buildChangedRoleAssignments(
    roleAssignments,
    pendingRoleAssignments,
  )

  const handleSaveRoleAssignments = async () => {
    if (!api.setRoleAssignment) return

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

      await loadData()
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
    if (!api.setRoleAssignment || !applyAllRoleModel) return

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

      await loadData()
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

  return (
    <div data-testid="settings-page-role-assignments">
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
    </div>
  )
}
