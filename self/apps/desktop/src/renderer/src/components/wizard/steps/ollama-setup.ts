import { defineWizardStep } from '@nous/shared'
import { WizardStepOllamaSetup } from '../WizardStepOllamaSetup'

/**
 * Ollama setup wizard step.
 *
 * SP 1.7 (Fix #4) — `previous: 'agent_identity'` per ADR 022.
 * Back-nav from `ollama-setup` lands on `agent_identity` (the natural
 * one-step-back per the renderer-canonical user-facing flow). Pre-SP-1.7
 * this was `'welcome'` (per ADR 021); SP 1.7 supersedes that posture for
 * this step. ADR 021's broader principle ("inserted steps should preserve
 * back-nav reachability of all prior steps") is amended — not superseded —
 * by ADR 022. See `.worklog/adr/022-renderer-registry-canonical-user-facing-flow.mdx`.
 */
export const ollamaSetupStep = defineWizardStep({
  id: 'ollama-setup',
  label: 'Ollama',
  component: WizardStepOllamaSetup,
  backendStep: 'ollama_check',
  previous: 'agent_identity',
  skippable: true,
})
