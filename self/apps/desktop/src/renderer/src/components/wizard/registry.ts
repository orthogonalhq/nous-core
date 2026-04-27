/**
 * First-run wizard registry — renderer-side single source of truth.
 *
 * Imports the factory, validators, and derivation helpers from `@nous/shared`.
 * Constructs `WIZARD_STEP_REGISTRY` from the four step-definition modules,
 * then:
 *   1. Runs `validateWizardRegistry` to catch duplicate ids / backend steps,
 *      invalid `previous` references, multiple roots, or empty registry.
 *   2. Runs `assertRegistryMatchesManifest` to catch coverage drift between
 *      the registry and the shared backend-step manifest
 *      (`FIRST_RUN_STEP_VALUES`).
 *
 * Both validators throw `WizardRegistryInvariantError` at module load if the
 * registry is malformed — the renderer fails fast at boot rather than
 * producing a silently-broken wizard.
 *
 * Derived exports:
 *   - `WizardStepId`             — literal union of entry ids.
 *   - `BACKEND_STEP_TO_WIZARD_STEP` — map from backend step (incl. `'complete'`)
 *                                     to the owning wizard step id.
 *   - `PREVIOUS_STEP_MAP`        — back-nav map derived from each entry's
 *                                   `previous` field.
 *   - `WIZARD_STEPS`             — thin accessor over the registry tuple for
 *                                   `WizardStepIndicator` prop compatibility.
 */
import {
  assertRegistryMatchesManifest,
  defineWizardStep,
  deriveBackendStepToWizardStep,
  derivePreviousStepMap,
  deriveWizardStepIds,
  FIRST_RUN_STEP_VALUES,
  validateWizardRegistry,
  type FirstRunCurrentStep,
  type FirstRunStep,
  type WizardStepDefinition,
} from '@nous/shared'
import { confirmationStep } from './steps/confirmation'
import { identityStep } from './steps/identity'
import { modelDownloadStep } from './steps/model-download'
import { ollamaSetupStep } from './steps/ollama-setup'
import { welcomeStep } from './steps/welcome'

// Re-export the factory + type so step definition files can also import from
// this local path if callers prefer a renderer-scoped import graph.
export { defineWizardStep }
export type { WizardStepDefinition }

// SP 1.7 Fix #5 — re-export `FIRST_RUN_STEP_VALUES` so renderer-internal
// orchestrator code (`FirstRunWizard.tsx`) can consume it without taking a
// new top-level `@nous/shared` import. Keeps the orchestrator's import graph
// homogeneous (renderer-internal); this registry is the renderer-internal
// aggregation point for shared-package wizard primitives.
export { FIRST_RUN_STEP_VALUES }

export const WIZARD_STEP_REGISTRY = [
  welcomeStep,
  identityStep,
  ollamaSetupStep,
  modelDownloadStep,
  confirmationStep,
] as const

// Module-load validation. Drift (duplicate-id, duplicate-backend-step,
// invalid-previous, multiple-roots, empty-registry, manifest-mismatch) throws
// at renderer boot — fail-fast, not fail-silently.
validateWizardRegistry(WIZARD_STEP_REGISTRY)
assertRegistryMatchesManifest(WIZARD_STEP_REGISTRY)

export type WizardStepId = (typeof WIZARD_STEP_REGISTRY)[number]['id']

// Merge the derived backend-step → wizard-step map with the `complete: 'confirmation'`
// special key. Today's renderer relies on `BACKEND_STEP_TO_WIZARD_STEP` being
// keyed by `FirstRunCurrentStep` (which includes the `'complete'` terminal
// state). The derivation helper only yields keys for actual backend steps, so
// we merge the terminal mapping at the renderer boundary rather than burdening
// the shared package with UI concerns.
export const BACKEND_STEP_TO_WIZARD_STEP = {
  ...(deriveBackendStepToWizardStep(WIZARD_STEP_REGISTRY) as Record<
    FirstRunStep,
    WizardStepId
  >),
  complete: 'confirmation' as const,
} as Record<FirstRunCurrentStep, WizardStepId>

export const PREVIOUS_STEP_MAP = derivePreviousStepMap(
  WIZARD_STEP_REGISTRY,
) as Record<WizardStepId, WizardStepId | null>

export const WIZARD_STEP_IDS = deriveWizardStepIds(WIZARD_STEP_REGISTRY) as readonly WizardStepId[]

// Thin accessor for `WizardStepIndicator` (existing prop signature).
export const WIZARD_STEPS: readonly WizardStepDefinition[] = WIZARD_STEP_REGISTRY
