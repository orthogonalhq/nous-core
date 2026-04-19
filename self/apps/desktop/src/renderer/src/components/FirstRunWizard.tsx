import { useEffect, useState } from 'react'
import { WizardStepIndicator } from './wizard/WizardStepIndicator'
import './wizard/wizard.css'
import {
  BACKEND_STEP_TO_WIZARD_STEP,
  PREVIOUS_STEP_MAP,
  WIZARD_STEPS,
  WIZARD_STEP_REGISTRY,
  type WizardStepId,
} from './wizard/registry'
import {
  getRecommendedModelSpec,
  type FirstRunPrerequisites,
  type FirstRunState,
  type OllamaStatus,
  type RoleAssignments,
} from './wizard/types'
import { trpcMutate, trpcQuery } from './wizard/trpc-fetch'

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
      // Welcome is a UI-only step gated by welcomeCompleted. When backend
      // state is still at the welcome's natural successor (`ollama_check`),
      // toggling welcomeCompleted reveals welcome. When backend state has
      // advanced past the welcome's adjacent successor (e.g., user is on
      // `agent_identity` because SP 1.4 inserted it after welcome), set the
      // override to 'welcome' so the renderer dispatches to it directly.
      // Toggle welcomeCompleted in both cases so the welcome render isn't
      // immediately re-derived away on the next render.
      setWelcomeCompleted(false)
      setCurrentStepOverride('welcome')
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

  // Registry-driven render dispatch. Lookup the current entry; throw a clear
  // error if the id is unknown (should never happen — registry validators
  // guarantee WizardStepId covers every reachable state). Per-step prop
  // shapes are preserved verbatim through the `buildStepProps` resolver.
  const currentEntry = WIZARD_STEP_REGISTRY.find((entry) => entry.id === currentWizardStep)
  if (!currentEntry) {
    throw new Error(`[nous:wizard] Unknown step id: ${currentWizardStep}`)
  }

  // Per-step prop resolver. The component types differ (welcome takes an
  // `onContinue`; ollama takes `ollamaStatus` + `refreshOllamaStatus`; etc.),
  // so we build each step's prop object verbatim here rather than via a
  // discriminated union. This preserves each step component's existing prop
  // interface without requiring a renderer-side cast at the dispatch site.
  // The registry type erases `TComponent` to `unknown`; the switch on
  // `currentWizardStep` plus the component's own prop validation guarantees
  // type correctness at the call site.
  const StepComponent = currentEntry.component as unknown as React.ComponentType<Record<string, unknown>>
  const stepProps = (() => {
    switch (currentWizardStep) {
      case 'welcome':
        return {
          ...sharedProps,
          onStepComplete: (nextState: FirstRunState) => {
            applyStepCompletion('welcome', nextState)
          },
          onContinue: () => {
            console.log('[nous:wizard] Step completed: welcome')
            setWelcomeCompleted(true)
            setCurrentStepOverride(null)
          },
        }
      case 'agent_identity':
        return {
          ...sharedProps,
          onStepComplete: (nextState: FirstRunState) => {
            applyStepCompletion('agent_identity', nextState)
          },
        }
      case 'ollama-setup':
        return {
          ...sharedProps,
          ollamaStatus,
          refreshOllamaStatus,
          onStepComplete: (nextState: FirstRunState) => {
            applyStepCompletion('ollama_check', nextState)
          },
        }
      case 'model-download':
        return {
          ...sharedProps,
          selectedModelSpec,
          setSelectedModelSpec,
          onStepComplete: (nextState: FirstRunState) => {
            applyStepCompletion('model_download/provider_config', nextState)
          },
        }
      case 'confirmation':
        return {
          ...sharedProps,
          selectedModelSpec,
          roleAssignments,
          ollamaStatus,
          onStepComplete: (nextState: FirstRunState) => {
            applyStepCompletion('confirmation', nextState)
          },
          onFinish: () => {
            console.log('[nous:wizard] Step completed: confirmation')
            onComplete()
          },
        }
      default:
        throw new Error(`[nous:wizard] Unknown step id: ${currentWizardStep satisfies never}`)
    }
  })()

  // `roleAssignmentMode` is retained for SP 1.5 (auto-role-assign will reuse
  // the existing state shape). Reference it here so the linter does not flag
  // the state hook as unused during SP 1.1.
  void roleAssignmentMode
  void setRoleAssignments
  void setRoleAssignmentMode

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

        <StepComponent {...(stepProps as Record<string, unknown>)} />
      </div>
    </div>
  )
}
