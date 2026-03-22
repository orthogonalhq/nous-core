import {
  MODEL_ROLES,
  buildRecommendedRoleAssignments,
  formatLifecycleState,
  formatRoleLabel,
  getModelDisplayName,
  type OllamaStatus,
  type RoleAssignments,
  type WizardStepProps,
} from './types'

export interface WizardStepConfirmationProps extends WizardStepProps {
  selectedModelSpec: string | null
  roleAssignments: RoleAssignments
  ollamaStatus: OllamaStatus | null
  onFinish: () => void
}

export function WizardStepConfirmation({
  prerequisites,
  selectedModelSpec,
  roleAssignments,
  ollamaStatus,
  onFinish,
}: WizardStepConfirmationProps) {
  const effectiveAssignments =
    Object.keys(roleAssignments).length > 0
      ? roleAssignments
      : buildRecommendedRoleAssignments(prerequisites, selectedModelSpec)

  return (
    <div className="nous-wizard__stack">
      <section className="nous-wizard__hero">
        <div className="nous-wizard__status nous-wizard__status--complete">
          <span className="nous-wizard__status-dot" />
          <span>Configuration saved</span>
        </div>
        <h1 className="nous-wizard__title">Your desktop runtime is ready.</h1>
        <p className="nous-wizard__subtitle">
          The backend state machine is complete, the local provider is configured,
          and role assignments are stored. Finish the wizard to open the main
          desktop workspace.
        </p>
      </section>

      <div className="nous-wizard__grid">
        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">Runtime summary</h2>

          <div className="nous-wizard__summary-list">
            <div className="nous-wizard__summary-item">
              <span>Hardware profile</span>
              <span>{prerequisites?.recommendations.profileName ?? 'Unknown'}</span>
            </div>
            <div className="nous-wizard__summary-item">
              <span>Selected model</span>
              <span>
                {selectedModelSpec
                  ? getModelDisplayName(selectedModelSpec, prerequisites)
                  : 'Not recorded'}
              </span>
            </div>
            <div className="nous-wizard__summary-item">
              <span>Ollama</span>
              <span>
                {ollamaStatus ? formatLifecycleState(ollamaStatus.state) : 'Unknown'}
              </span>
            </div>
          </div>
        </section>

        <section className="nous-wizard__card">
          <h2 className="nous-wizard__section-title">Role assignments</h2>

          <div className="nous-wizard__summary-list">
            {MODEL_ROLES.map((role) => (
              <div key={role} className="nous-wizard__summary-item">
                <span>{formatRoleLabel(role)}</span>
                <span>
                  {effectiveAssignments[role]
                    ? getModelDisplayName(effectiveAssignments[role] ?? '', prerequisites)
                    : 'Not assigned'}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="nous-wizard__button-row">
        <button
          type="button"
          className="nous-wizard__button nous-wizard__button--primary"
          onClick={onFinish}
        >
          Open workspace
        </button>
      </div>
    </div>
  )
}
