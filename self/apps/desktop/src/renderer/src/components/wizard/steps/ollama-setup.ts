import { defineWizardStep } from '@nous/shared'
import { WizardStepOllamaSetup } from '../WizardStepOllamaSetup'

export const ollamaSetupStep = defineWizardStep({
  id: 'ollama-setup',
  label: 'Ollama',
  component: WizardStepOllamaSetup,
  backendStep: 'ollama_check',
  previous: 'welcome',
  skippable: true,
})
