---
nous:
  v: 2
  kind: workflow_node
  id: request-cortex-approval
  skill: self-repair-orchestration-sop
  templates:
    - pfc-approval-request-template
    - handoff-disposition-template
---

# Request Cortex Approval

## Purpose

Enforce explicit Cortex approval gate before remediation execution.

## Inputs

- Diagnosis and remediation proposal
- Current retry/cost evidence

## Procedure

1. Use `templates/pfc-approval-request-template.md`.
2. Emit approval request packet with bounded execution plan.
3. Wait for explicit approval decision packet.
4. If decision is `approved`, continue to `choose-implementation-mode`.
5. If decision is `conditional`, update proposal constraints and route to `build-diagnosis-proposal`.
6. If decision is `rejected`, mark run as blocked or escalated and route to `finalize-self-repair-report`.
7. Emit a disposition packet plus required prose summary using `templates/handoff-disposition-template.md`.

## Outputs

- Cortex approval request packet
- Cortex approval decision record
- Approval outcome route decision
- Handoff disposition packet and prose summary
