export type {
  FirstRunState,
  FirstRunPrerequisites,
  FirstRunActionResult,
  FirstRunStep,
  FirstRunRoleAssignmentInput,
} from '@nous/shared-server'
import type {
  FirstRunState,
  FirstRunPrerequisites,
  FirstRunStep,
} from '@nous/shared-server'
import type { PersonalityConfig } from '@nous/cortex-core/personality'

export type FirstRunCurrentStep = FirstRunState['currentStep']

export { ModelRoleSchema, MODEL_ROLE_LABELS } from '@nous/shared'
export type { ModelRole } from '@nous/shared'
import { ModelRoleSchema, type ModelRole, MODEL_ROLE_LABELS } from '@nous/shared'

type ElectronAPI = Window['electronAPI']
export type OllamaStatus = Awaited<ReturnType<ElectronAPI['ollama']['getStatus']>>
export type OllamaLifecycleState = OllamaStatus['state']
export type OllamaModelPullProgress = Parameters<ElectronAPI['ollama']['onPullProgress']>[0] extends (
  progress: infer T,
) => void
  ? T
  : never
export type RoleAssignments = Partial<Record<ModelRole, string>>
export type ModelRecommendation = NonNullable<FirstRunPrerequisites['recommendations']['singleModel']>
export type RoleModelRecommendation = FirstRunPrerequisites['recommendations']['multiModel'][number]

export {
  BACKEND_STEP_TO_WIZARD_STEP,
  WIZARD_STEPS,
  WIZARD_STEP_REGISTRY,
} from './registry'
export type { WizardStepId, WizardStepDefinition } from './registry'

export type WizardModelOption = {
  modelId: string
  modelSpec: string
  displayName: string
  reason: string
  ramRequiredMB: number
}

export interface WizardStepProps {
  state: FirstRunState
  prerequisites: FirstRunPrerequisites | null
  actionInProgress: boolean
  actionError: string | null
  setActionInProgress: (value: boolean) => void
  setActionError: (value: string | null) => void
  onStepComplete: (nextState: FirstRunState) => void
}

// SP 1.8 Fix #2 — Identity draft shape lifted to the orchestrator
// (`FirstRunWizard`) so back-nav into the identity step retains entered
// values. `subStage` is NOT included — the sub-stage cursor remains
// component-local per SP 1.4 Goals item 11 (sub-stage progress is
// ephemeral and not persisted; on remount the component restarts at
// sub-stage A). The lifted slice carries only entered field values.
//
// Trace: SP 1.8 SDS § Data Model § Identity draft contract; Goals C1 / C2 / C4;
// Implementation Plan Task #2; Invariant B.
export interface ProfileFormState {
  displayName?: string
  role?: string
  primaryUseCase?: string
  expertise?: 'beginner' | 'intermediate' | 'advanced'
}

export interface IdentityDraft {
  name: string
  personality: PersonalityConfig
  profile: ProfileFormState
  advancedOpen: boolean
}

export const INITIAL_IDENTITY_DRAFT: IdentityDraft = {
  name: '',
  personality: { preset: 'balanced' },
  profile: {},
  advancedOpen: false,
}

export interface WizardStepIdentityProps extends WizardStepProps {
  identityDraft: IdentityDraft
  setIdentityDraft: (next: IdentityDraft) => void
}

export const MODEL_ROLES = ModelRoleSchema.options

export function parseModelSpec(modelSpec: string): { provider: string; modelId: string } | null {
  const [provider, ...modelIdParts] = modelSpec.split(':')
  if (!provider || modelIdParts.length === 0) {
    return null
  }

  return {
    provider,
    modelId: modelIdParts.join(':'),
  }
}

export function toOllamaModelSpec(modelId: string): string {
  return `ollama:${modelId}`
}

export function getRecommendedModelSpec(
  prerequisites: FirstRunPrerequisites | null,
): string | null {
  return prerequisites?.recommendations.singleModel?.modelSpec ?? null
}

export function getModelDisplayName(
  modelSpec: string,
  prerequisites: FirstRunPrerequisites | null,
): string {
  const recommended = buildWizardModelOptions(prerequisites).find(
    (option) => option.modelSpec === modelSpec,
  )
  if (recommended) {
    return recommended.displayName
  }

  const parsed = parseModelSpec(modelSpec)
  return parsed?.modelId ?? modelSpec
}

export function buildWizardModelOptions(
  prerequisites: FirstRunPrerequisites | null,
  selectedModelSpec?: string | null,
): WizardModelOption[] {
  if (!prerequisites) {
    return selectedModelSpec
      ? [
          {
            modelId: parseModelSpec(selectedModelSpec)?.modelId ?? selectedModelSpec,
            modelSpec: selectedModelSpec,
            displayName: parseModelSpec(selectedModelSpec)?.modelId ?? selectedModelSpec,
            reason: 'Currently selected model.',
            ramRequiredMB: 0,
          },
        ]
      : []
  }

  const options = new Map<string, WizardModelOption>()
  const singleModel = prerequisites.recommendations.singleModel
  if (singleModel) {
    options.set(singleModel.modelSpec, {
      modelId: singleModel.modelId,
      modelSpec: singleModel.modelSpec,
      displayName: singleModel.displayName,
      reason: singleModel.reason,
      ramRequiredMB: singleModel.ramRequiredMB,
    })
  }

  for (const item of prerequisites.recommendations.multiModel) {
    options.set(item.recommendation.modelSpec, {
      modelId: item.recommendation.modelId,
      modelSpec: item.recommendation.modelSpec,
      displayName: item.recommendation.displayName,
      reason: item.recommendation.reason,
      ramRequiredMB: item.recommendation.ramRequiredMB,
    })
  }

  if (selectedModelSpec && !options.has(selectedModelSpec)) {
    const parsed = parseModelSpec(selectedModelSpec)
    options.set(selectedModelSpec, {
      modelId: parsed?.modelId ?? selectedModelSpec,
      modelSpec: selectedModelSpec,
      displayName: parsed?.modelId ?? selectedModelSpec,
      reason: 'Currently selected model.',
      ramRequiredMB: 0,
    })
  }

  return [...options.values()]
}

export function buildRecommendedRoleAssignments(
  prerequisites: FirstRunPrerequisites | null,
  fallbackModelSpec: string | null,
): RoleAssignments {
  const assignments: RoleAssignments = {}

  if (fallbackModelSpec) {
    for (const role of MODEL_ROLES) {
      assignments[role] = fallbackModelSpec
    }
  }

  if (!prerequisites) {
    return assignments
  }

  for (const item of prerequisites.recommendations.multiModel) {
    assignments[item.role] = item.recommendation.modelSpec
  }

  return assignments
}

export function formatRoleLabel(role: ModelRole): string {
  return MODEL_ROLE_LABELS[role]
}

export function formatLifecycleState(state: OllamaLifecycleState): string {
  switch (state) {
    case 'not_installed':
      return 'Not installed'
    case 'installed_stopped':
      return 'Installed, not running'
    case 'starting':
      return 'Starting'
    case 'running':
      return 'Running'
    case 'stopping':
      return 'Stopping'
    case 'error':
      return 'Error'
    default:
      return state
  }
}
