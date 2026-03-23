---
nous:
  v: 2
  kind: workflow_node
  id: choose-implementation-mode
  skill: self-repair-orchestration-sop
  templates:
    - handoff-disposition-template
---

# Choose Implementation Mode

## Purpose

Branch execution to direct or dispatch-team path based on approval and
constraints.

## Inputs

- Approved remediation proposal
- Approval conditions

## Procedure

1. Select `direct` when constrained change can be executed safely in one actor context.
2. Select `dispatch-team` when specialized roles or parallel execution are required.
3. Emit a disposition packet plus required prose summary using `templates/handoff-disposition-template.md`.
4. Record branch decision and required handoff template ref.

## Outputs

- Implementation branch decision
- Handoff disposition packet and prose summary
- Execution prerequisites checklist
