import { useEffect } from 'react'
import {
  MODEL_ROLES,
  buildRecommendedRoleAssignments,
  buildWizardModelOptions,
  formatRoleLabel,
  getModelDisplayName,
  type FirstRunActionResult,
  type RoleAssignments,
  type WizardStepProps,
} from './types'
import { trpcMutate } from './trpc-fetch'

type RoleAssignmentMode = 'default' | 'advanced'

export interface WizardStepRoleAssignmentProps extends WizardStepProps {
  selectedModelSpec: string | null
  roleAssignments: RoleAssignments
  setRoleAssignments: (value: RoleAssignments) => void
  roleAssignmentMode: RoleAssignmentMode
  setRoleAssignmentMode: (value: RoleAssignmentMode) => void
}

export function WizardStepRoleAssignment({
  prerequisites,
  selectedModelSpec,
  roleAssignments,
  setRoleAssignments,
  roleAssignmentMode,
  setRoleAssignmentMode,
  actionInProgress,
  setActionError,
  setActionInProgress,
  onStepComplete,
}: WizardStepRoleAssignmentProps) {
  const defaultAssignments = buildRecommendedRoleAssignments(
    prerequisites,
    selectedModelSpec,
  )
  const effectiveAssignments =
    Object.keys(roleAssignments).length > 0 ? roleAssignments : defaultAssignments
  const options = buildWizardModelOptions(prerequisites, selectedModelSpec)

  useEffect(() => {
    if (selectedModelSpec && Object.keys(roleAssignments).length === 0) {
      setRoleAssignments(defaultAssignments)
    }
  }, [defaultAssignments, roleAssignments, selectedModelSpec, setRoleAssignments])

  const missingAssignments = MODEL_ROLES.filter((role) => {
    if (roleAssignmentMode === 'default') {
      return !selectedModelSpec
    }

    return !effectiveAssignments[role]
  })

  const handleContinue = async () => {
    if (!selectedModelSpec) {
      setActionError('Choose and configure a model before assigning roles.')
      return
    }

    const nextAssignments: RoleAssignments =
      roleAssignmentMode === 'default'
        ? MODEL_ROLES.reduce<RoleAssignments>((result, role) => {
            result[role] = selectedModelSpec
            return result
          }, {})
        : MODEL_ROLES.reduce<RoleAssignments>((result, role) => {
            const modelSpec = effectiveAssignments[role]
            if (modelSpec) {
              result[role] = modelSpec
            }
            return result
          }, {})

    if (MODEL_ROLES.some((role) => !nextAssignments[role])) {
      setActionError('Assign a model to every role before continuing.')
      return
    }

    setActionError(null)
    setActionInProgress(true)
    try {
      const assignments = MODEL_ROLES.map((role) => ({
        role,
        modelSpec: nextAssignments[role] ?? selectedModelSpec,
      }))
      const result = await trpcMutate<FirstRunActionResult>('firstRun.assignRoles', { assignments })
      if (!result.success) {
        throw new Error(result.error ?? 'Role assignment did not complete successfully.')
      }

      setRoleAssignments(nextAssignments)
      onStepComplete(result.state)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
      setActionInProgress(false)
    }
  }

  return (
    <div className="nous-wizard__stack">
      <section className="nous-wizard__hero">
        <div className="nous-wizard__eyebrow">Role assignment</div>
        <h1 className="nous-wizard__title">Decide how Nous should use your local model.</h1>
        <p className="nous-wizard__subtitle">
          Simple mode assigns one downloaded model to every role. Advanced
          mode lets you override individual roles using the recommendations from
          your detected hardware profile.
        </p>
      </section>

      <div className="nous-wizard__grid">
        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">Assignment mode</h2>
          <p className="nous-wizard__section-copy">
            The shared default right now is{' '}
            {selectedModelSpec
              ? getModelDisplayName(selectedModelSpec, prerequisites)
              : 'not selected yet'}
            .
          </p>

          <div className="nous-wizard__button-row">
            <button
              type="button"
              className={`nous-wizard__button ${
                roleAssignmentMode === 'default'
                  ? 'nous-wizard__button--primary'
                  : 'nous-wizard__button--secondary'
              }`}
              onClick={() => setRoleAssignmentMode('default')}
            >
              Simple mode
            </button>
            <button
              type="button"
              className={`nous-wizard__button ${
                roleAssignmentMode === 'advanced'
                  ? 'nous-wizard__button--primary'
                  : 'nous-wizard__button--secondary'
              }`}
              onClick={() => setRoleAssignmentMode('advanced')}
            >
              Advanced mode
            </button>
          </div>

          {roleAssignmentMode === 'default' ? (
            <div className="nous-wizard__summary-list">
              {MODEL_ROLES.map((role) => (
                <div key={role} className="nous-wizard__summary-item">
                  <span>{formatRoleLabel(role)}</span>
                  <span>
                    {selectedModelSpec
                      ? getModelDisplayName(selectedModelSpec, prerequisites)
                      : 'Pending model selection'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="nous-wizard__stack">
              {MODEL_ROLES.map((role) => {
                const recommendation = prerequisites?.recommendations.multiModel.find(
                  (item) => item.role === role,
                )

                return (
                  <label key={role} className="nous-wizard__label">
                    <span>{formatRoleLabel(role)}</span>
                    <select
                      className="nous-wizard__select"
                      aria-label={formatRoleLabel(role)}
                      value={effectiveAssignments[role] ?? ''}
                      onChange={(event) => {
                        setRoleAssignments({
                          ...effectiveAssignments,
                          [role]: event.target.value || undefined,
                        })
                      }}
                    >
                      <option value="">Select a model</option>
                      {options.map((option) => (
                        <option key={`${role}-${option.modelSpec}`} value={option.modelSpec}>
                          {option.displayName}
                        </option>
                      ))}
                    </select>
                    <span className="nous-wizard__hint">
                      {recommendation?.recommendation.reason ??
                        'Falls back to the single-model recommendation.'}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </section>

        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">Configuration summary</h2>
          <p className="nous-wizard__section-copy">
            Review the assignments that will be written through the first-run IPC
            route before the wizard transitions to confirmation.
          </p>

          <div className="nous-wizard__summary-list">
            <div className="nous-wizard__summary-item">
              <span>Mode</span>
              <span>{roleAssignmentMode === 'default' ? 'Simple' : 'Advanced'}</span>
            </div>
            <div className="nous-wizard__summary-item">
              <span>Configured roles</span>
              <span>{MODEL_ROLES.length - missingAssignments.length} / {MODEL_ROLES.length}</span>
            </div>
            <div className="nous-wizard__summary-item">
              <span>Fallback model</span>
              <span>
                {selectedModelSpec
                  ? getModelDisplayName(selectedModelSpec, prerequisites)
                  : 'None selected'}
              </span>
            </div>
          </div>

          <div className="nous-wizard__button-row">
            <button
              type="button"
              className="nous-wizard__button nous-wizard__button--primary"
              onClick={() => {
                void handleContinue()
              }}
              disabled={actionInProgress || missingAssignments.length > 0}
            >
              {actionInProgress ? 'Saving…' : 'Continue'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
