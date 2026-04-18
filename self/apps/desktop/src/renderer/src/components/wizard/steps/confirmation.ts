import { defineWizardStep } from '@nous/shared'
import { WizardStepConfirmation } from '../WizardStepConfirmation'

/**
 * `previous: 'model-download'` — NOT `'role-assignment'`. The dedicated
 * `role-assignment` wizard step is removed per Decision 3 and SP 1.1 Goals
 * item 9. The backend `role_assignment` step is auto-marked complete by the
 * `model-download` step's bridge logic (SDS § 2.6).
 */
export const confirmationStep = defineWizardStep({
  id: 'confirmation',
  label: 'Finish',
  component: WizardStepConfirmation,
  backendStep: null,
  previous: 'model-download',
  skippable: false,
})
