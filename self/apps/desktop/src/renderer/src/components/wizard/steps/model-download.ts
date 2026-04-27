import { defineWizardStep } from '@nous/shared'
import { WizardStepModelDownload } from '../WizardStepModelDownload'

/**
 * The `model-download` wizard step drives three backend state-machine steps
 * (model_download, provider_config, role_assignment) via its completion
 * handlers:
 *   - `model_download` — marked complete when the Ollama pull succeeds
 *     (or when the user chooses "Skip — I'll add models later").
 *   - `provider_config` — marked complete when the tRPC
 *     `firstRun.configureProvider` call succeeds (or when the user skips).
 *   - `role_assignment` — on the download path, marked complete by the
 *     `firstRun.assignRoles` mutation (SP 1.5, Decision 3). On the skip
 *     path, retained as a placeholder `firstRun.completeStep` call per
 *     SP 1.5 SDS § 0 Note 3 (Path A): no modelSpec is available because
 *     `firstRun.configureProvider` is also skipped.
 *
 * The multi-backend-step coverage is declared via `extraBackendSteps` per
 * ADR 016 (extraBackendSteps extension of Decision 2's ratified shape).
 */
export const modelDownloadStep = defineWizardStep({
  id: 'model-download',
  label: 'Model',
  component: WizardStepModelDownload,
  backendStep: 'model_download',
  extraBackendSteps: ['provider_config', 'role_assignment'],
  previous: 'ollama-setup',
  skippable: true,
})
