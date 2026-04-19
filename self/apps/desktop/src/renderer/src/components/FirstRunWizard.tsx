import { useEffect, useState } from 'react'
import { WizardStepIndicator } from './wizard/WizardStepIndicator'
import './wizard/wizard.css'
import {
  BACKEND_STEP_TO_WIZARD_STEP,
  FIRST_RUN_STEP_VALUES,
  PREVIOUS_STEP_MAP,
  WIZARD_STEPS,
  WIZARD_STEP_REGISTRY,
  type WizardStepId,
} from './wizard/registry'

// SP 1.7 Fix #6 — module-private helper. Returns the next-in-registry step
// id after `currentId`, or `null` if `currentId` is the last entry (or not
// found, defensive). Not exported; if a future sub-phase needs this
// elsewhere, it migrates to `wizard/registry.ts` with a unit test.
function deriveNextRegistryStepAfter(
  currentId: WizardStepId,
  registry: typeof WIZARD_STEP_REGISTRY,
): WizardStepId | null {
  const idx = registry.findIndex((entry) => entry.id === currentId)
  if (idx === -1 || idx === registry.length - 1) return null
  return registry[idx + 1].id
}
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
    // SP 1.7 Fix #5 (Edit B) — registry-aware predicate. The head of the
    // backend manifest is now `'agent_identity'` (post-Fix-#1), but a
    // resume state with `currentStep === FIRST_RUN_STEP_VALUES[0]` legitimately
    // means "user is at the start" — so welcome stays gated until the user
    // clicks Continue. Resume from any later backend step skips welcome.
    initialState.currentStep !== FIRST_RUN_STEP_VALUES[0],
  )
  // Client-side override for back navigation. Lets users revisit prior steps
  // without changing backend state. Cleared when user completes a step normally.
  const [currentStepOverride, setCurrentStepOverride] = useState<WizardStepId | null>(null)

  // SP 1.7 Fix #5 (Edit A) — frontier-then-welcome derivation. The frontier
  // is the wizard step backed by the backend's current step; welcome is a
  // UI-only step gated by `welcomeCompleted` (no backend correspondence).
  const frontierWizardStep: WizardStepId =
    BACKEND_STEP_TO_WIZARD_STEP[firstRunState.currentStep]
  const derivedCurrentWizardStep: WizardStepId = welcomeCompleted
    ? frontierWizardStep
    : 'welcome'

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
    // SP 1.7 Fix #5 (Edit C) — registry-aware resume sync. When backend
    // state advances past `FIRST_RUN_STEP_VALUES[0]`, the user has clearly
    // moved past welcome; lift the welcome gate.
    if (firstRunState.currentStep !== FIRST_RUN_STEP_VALUES[0]) {
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
    // SP 1.7 Fix #6 — always-set advancement (Design A). Advance the override
    // to the next-in-registry step from the *currently-rendered* wizard step
    // (NOT the just-completed backend step's wizard mapping — those differ
    // when the user back-navigated and is now completing an earlier step).
    // The override is set even when it equals the new frontier; the next
    // render's derivation reads the override and the rendered step id is
    // unchanged. The override is cleared (set to `null`) only when the
    // helper returns `null` — i.e., the user just completed the last
    // registry entry (`confirmation`); the wizard exits via `onFinish` →
    // `onComplete()` and the `null` override is correct.
    const nextId = deriveNextRegistryStepAfter(currentWizardStep, WIZARD_STEP_REGISTRY)
    setCurrentStepOverride(nextId)
    setActionError(null)
    setActionInProgress(false)
  }

  const handleBack = () => {
    if (!previousStep) return
    if (previousStep === 'welcome') {
      // Welcome is a UI-only step gated by welcomeCompleted. Per SP 1.7
      // Fix #5, the welcome gate is registry-aware (`currentStep !==
      // FIRST_RUN_STEP_VALUES[0]`). When the backend state is still at the
      // head (`FIRST_RUN_STEP_VALUES[0]`, i.e. `agent_identity`),
      // toggling welcomeCompleted reveals welcome. When the backend state
      // has advanced past the head, set the override to 'welcome' so the
      // renderer dispatches to it directly. Toggle welcomeCompleted in
      // both cases so the welcome render isn't immediately re-derived
      // away on the next render.
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
      // SP 1.7 Fix #6 reset-path interaction — clear any stale override
      // from the prior session (e.g., `'confirmation'` if the user
      // back-navigated from confirmation before clicking Reset). Without
      // this, the next render would resolve `currentWizardStep` to the
      // stale override instead of `'welcome'`.
      setCurrentStepOverride(null)
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
            // SP 1.7 Fix #6 — always-set advancement (Design A). Advance to
            // the next-in-registry step (post-Fix-#1: `agent_identity`).
            // Setting the override (instead of clearing it) ensures that on
            // the back-then-Continue path from welcome we land at the next
            // user-facing step, not the backend frontier (which may be
            // arbitrarily far ahead, e.g. `confirmation`).
            const nextId = deriveNextRegistryStepAfter('welcome', WIZARD_STEP_REGISTRY)
            setCurrentStepOverride(nextId)
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
