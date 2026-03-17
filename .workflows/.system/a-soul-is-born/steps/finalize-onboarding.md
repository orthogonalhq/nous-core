---
nous:
  v: 1
  kind: workflow_step
  id: finalize-onboarding
name: Finalize Onboarding
description: Assemble the final onboarding response and any proposed repository updates.
type: model-call
governance: must
executionModel: synchronous
config:
  type: model-call
  modelRole: reasoner
  promptRef: workflow://a-soul-is-born/finalize-onboarding
---

# Finalize Onboarding

## Purpose

Assemble the final onboarding response and any proposed repository updates.

## Inputs

- Scope statement
- `Principal Preference Seed`
- `STM-LTM Bootstrap Handoff`
- Any outstanding conflicts or proposal-only repository changes

## Procedure

1. Produce the final `Onboarding Summary`.
2. Confirm that identity-affecting repository changes remain proposal-only until Principal approval.
3. Summarize open blockers, pending confirmations, and approved next actions.
4. Package the response set in the required output order.

## Outputs

- `Onboarding Summary`
- `Proposed Repository Updates`
- Final blocker and approval summary
