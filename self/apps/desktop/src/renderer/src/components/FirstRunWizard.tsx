import { useEffect, useState } from 'react'
import { WizardStepConfirmation } from './wizard/WizardStepConfirmation'
import { WizardStepIndicator } from './wizard/WizardStepIndicator'
import { WizardStepModelDownload } from './wizard/WizardStepModelDownload'
import { WizardStepOllamaSetup } from './wizard/WizardStepOllamaSetup'
import { WizardStepRoleAssignment } from './wizard/WizardStepRoleAssignment'
import { WizardStepWelcome } from './wizard/WizardStepWelcome'
import './wizard/wizard.css'
import {
  BACKEND_STEP_TO_WIZARD_STEP,
  WIZARD_STEPS,
  getRecommendedModelSpec,
  type FirstRunPrerequisites,
  type FirstRunState,
  type OllamaStatus,
  type RoleAssignments,
  type WizardStepId,
} from './wizard/types'
import { trpcQuery, trpcMutate } from './wizard/trpc-fetch'

/** Back-navigation map: from each step, where does Back take you? */
const PREVIOUS_STEP_MAP: Record<WizardStepId, WizardStepId | null> = {
  welcome: null,
  'ollama-setup': 'welcome',
  'model-download': 'ollama-setup',
  'role-assignment': 'model-download',
  confirmation: 'role-assignment',
}

type RoleAssignmentMode = 'default' | 'advanced'

export interface FirstRunWizardProps {
  initialState: FirstRunState
  onComplete: () => void
}

export function FirstRunWizard({
  initialState,
  onComplete,
}: FirstRunWizardProps) {
  const [firstRunState, setFirstRunState] = useState(initialState)
  const [prerequisites, setPrerequisites] = useState<FirstRunPrerequisites | null>(null)
  const [prerequisitesLoading, setPrerequisitesLoading] = useState(true)
  const [prerequisitesError, setPrerequisitesError] = useState<string | null>(null)
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null)
  const [selectedModelSpec, setSelectedModelSpec] = useState<string | null>(null)
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignments>({})
  const [roleAssignmentMode, setRoleAssignmentMode] =
    useState<RoleAssignmentMode>('default')
  const [actionInProgress, setActionInProgress] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [welcomeCompleted, setWelcomeCompleted] = useState(
    initialState.currentStep !== 'ollama_check',
  )
  // Client-side override for back navigation. Lets users revisit prior steps
  // without changing backend state. Cleared when user completes a step normally.
  const [currentStepOverride, setCurrentStepOverride] = useState<WizardStepId | null>(null)

  const derivedCurrentWizardStep: WizardStepId =
    firstRunState.currentStep === 'ollama_check' && !welcomeCompleted
      ? 'welcome'
      : BACKEND_STEP_TO_WIZARD_STEP[firstRunState.currentStep]

  const currentWizardStep: WizardStepId = currentStepOverride ?? derivedCurrentWizardStep
  const previousStep = PREVIOUS_STEP_MAP[currentWizardStep]
  const canGoBack = previousStep !== null

  useEffect(() => {
    console.log(`[nous:wizard] Step rendered: ${currentWizardStep}`)
  }, [currentWizardStep])

  useEffect(() => {
    if (actionError) {
      console.log(`[nous:wizard] Error: ${actionError}`)
    }
  }, [actionError])

  useEffect(() => {
    if (prerequisitesError) {
      console.log(`[nous:wizard] Error: ${prerequisitesError}`)
    }
  }, [prerequisitesError])

  const loadPrerequisites = async () => {
    setPrerequisitesLoading(true)
    setPrerequisitesError(null)

    try {
      const nextPrerequisites = await trpcQuery<FirstRunPrerequisites>('firstRun.checkPrerequisites')
      setPrerequisites(nextPrerequisites)
      setOllamaStatus(nextPrerequisites.ollama)
      setSelectedModelSpec(
        (currentModelSpec) =>
          currentModelSpec ?? getRecommendedModelSpec(nextPrerequisites),
      )
      console.log('[nous:wizard] Prerequisites loaded')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setPrerequisitesError(message)
    } finally {
      setPrerequisitesLoading(false)
    }
  }

  useEffect(() => {
    void loadPrerequisites()

    const cleanup = window.electronAPI.ollama.onStateChange((status) => {
      setOllamaStatus(status)
    })

    return () => {
      cleanup()
    }
  }, [])

  useEffect(() => {
    if (firstRunState.currentStep !== 'ollama_check') {
      setWelcomeCompleted(true)
    }
  }, [firstRunState.currentStep])

  const refreshOllamaStatus = async () => {
    const nextStatus = await window.electronAPI.ollama.getStatus()
    setOllamaStatus(nextStatus)
  }

  const applyStepCompletion = (label: string, nextState: FirstRunState) => {
    console.log(`[nous:wizard] Step completed: ${label}`)
    setFirstRunState(nextState)
    setCurrentStepOverride(null) // clear back-nav override on real advancement
    setActionError(null)
    setActionInProgress(false)
  }

  const handleBack = () => {
    if (!previousStep) return
    if (previousStep === 'welcome') {
      // Welcome is a UI-only step gated by welcomeCompleted
      setWelcomeCompleted(false)
      setCurrentStepOverride(null)
    } else {
      setCurrentStepOverride(previousStep)
    }
    setActionError(null)
  }

  const handleResetWizard = async () => {
    setActionError(null)
    setActionInProgress(true)

    try {
      const nextState = await trpcMutate<FirstRunState>('firstRun.resetWizard')
      setFirstRunState(nextState)
      setWelcomeCompleted(false)
      setRoleAssignments({})
      setRoleAssignmentMode('default')
      setSelectedModelSpec(getRecommendedModelSpec(prerequisites))
      await loadPrerequisites()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setActionError(message)
      setActionInProgress(false)
      return
    }

    setActionInProgress(false)
  }

  const sharedProps = {
    state: firstRunState,
    prerequisites,
    actionInProgress,
    actionError,
    setActionInProgress,
    setActionError,
  }

  return (
    <div className="nous-wizard">
      <div className="nous-wizard__container">
        {actionError || prerequisitesError ? (
          <div className="nous-wizard__alert" role="alert">
            <div>{actionError ?? prerequisitesError}</div>
            <div className="nous-wizard__button-row">
              <button
                type="button"
                className="nous-wizard__button nous-wizard__button--secondary"
                onClick={() => {
                  void loadPrerequisites()
                }}
                disabled={actionInProgress}
              >
                Retry prerequisites
              </button>
              <button
                type="button"
                className="nous-wizard__button nous-wizard__button--ghost"
                onClick={() => {
                  void handleResetWizard()
                }}
                disabled={actionInProgress}
              >
                Reset wizard
              </button>
            </div>
          </div>
        ) : null}

        {prerequisitesLoading && !prerequisites ? (
          <div className="nous-wizard__status nous-wizard__status--action">
            <span className="nous-wizard__status-dot" />
            <span>Loading hardware, Ollama status, and model recommendations…</span>
          </div>
        ) : null}

        <WizardStepIndicator steps={WIZARD_STEPS} currentStepId={currentWizardStep} />

        {canGoBack ? (
          <div className="nous-wizard__back-row">
            <button
              type="button"
              className="nous-wizard__button nous-wizard__button--ghost"
              onClick={handleBack}
              disabled={actionInProgress}
              data-testid="wizard-back-button"
            >
              ← Back
            </button>
          </div>
        ) : null}

        {currentWizardStep === 'welcome' ? (
          <WizardStepWelcome
            {...sharedProps}
            onStepComplete={(nextState) => {
              applyStepCompletion('welcome', nextState)
            }}
            onContinue={() => {
              console.log('[nous:wizard] Step completed: welcome')
              setWelcomeCompleted(true)
              setCurrentStepOverride(null)
            }}
          />
        ) : null}

        {currentWizardStep === 'ollama-setup' ? (
          <WizardStepOllamaSetup
            {...sharedProps}
            ollamaStatus={ollamaStatus}
            refreshOllamaStatus={refreshOllamaStatus}
            onStepComplete={(nextState) => {
              applyStepCompletion('ollama_check', nextState)
            }}
          />
        ) : null}

        {currentWizardStep === 'model-download' ? (
          <WizardStepModelDownload
            {...sharedProps}
            selectedModelSpec={selectedModelSpec}
            setSelectedModelSpec={setSelectedModelSpec}
            onStepComplete={(nextState) => {
              applyStepCompletion('model_download/provider_config', nextState)
            }}
          />
        ) : null}

        {currentWizardStep === 'role-assignment' ? (
          <WizardStepRoleAssignment
            {...sharedProps}
            selectedModelSpec={selectedModelSpec}
            roleAssignments={roleAssignments}
            setRoleAssignments={setRoleAssignments}
            roleAssignmentMode={roleAssignmentMode}
            setRoleAssignmentMode={setRoleAssignmentMode}
            onStepComplete={(nextState) => {
              applyStepCompletion('role_assignment', nextState)
            }}
          />
        ) : null}

        {currentWizardStep === 'confirmation' ? (
          <WizardStepConfirmation
            {...sharedProps}
            selectedModelSpec={selectedModelSpec}
            roleAssignments={roleAssignments}
            ollamaStatus={ollamaStatus}
            onStepComplete={(nextState) => {
              applyStepCompletion('confirmation', nextState)
            }}
            onFinish={() => {
              console.log('[nous:wizard] Step completed: confirmation')
              onComplete()
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
