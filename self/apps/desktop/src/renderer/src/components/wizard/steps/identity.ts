import { defineWizardStep } from '@nous/shared'
import { WizardStepIdentity } from '../WizardStepIdentity'

/**
 * Identity wizard step (SP 1.4 / WR-161).
 *
 * Three sub-stages — Naming → Personality → Profile — collected in
 * `WizardStepIdentity` and committed to disk via a single batched
 * `firstRun.writeIdentity` tRPC call when sub-stage C completes (submit
 * or skip). The `agent_identity` backend step transitions to `complete`
 * inside that procedure (per SP 1.3).
 *
 * `previous: 'welcome'` per SDS § 1.4 Back-Nav Posture and ADR 021 —
 * inserting `agent_identity` between `welcome` and `ollama-setup` does
 * NOT rewire `ollama-setup`'s `previous`. Forward navigation reflects
 * the new flow; backward navigation may "skip" the inserted step,
 * trading flow-perfectness for component-state preservation on back-nav.
 */
export const identityStep = defineWizardStep({
  id: 'agent_identity',
  label: 'Identity',
  component: WizardStepIdentity,
  backendStep: 'agent_identity',
  previous: 'welcome',
  skippable: true,
})
