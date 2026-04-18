import { defineWizardStep } from '@nous/shared'
import { WizardStepWelcome } from '../WizardStepWelcome'

export const welcomeStep = defineWizardStep({
  id: 'welcome',
  label: 'Welcome',
  component: WizardStepWelcome,
  backendStep: null,
  previous: null,
  skippable: false,
})
