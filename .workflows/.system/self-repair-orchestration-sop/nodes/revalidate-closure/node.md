---
nous:
  v: 2
  kind: workflow_node
  id: revalidate-closure
  skill: self-repair-orchestration-sop
  templates:
    - revalidation-closure-template
    - handoff-disposition-template
---

# Revalidate Closure

## Purpose

Verify remediation correctness and decide closure versus continued iteration.

## Inputs

- Execution evidence (direct or dispatch)
- Prior fail criteria and acceptance gates

## Procedure

1. Use `templates/revalidation-closure-template.md`.
2. Re-run required validation checks for repaired surfaces.
3. Recompute value-proportional retry decision if unresolved issues remain.
4. Emit closure status packet (`continue`, `accept`, or `escalate`).
5. Emit a disposition packet plus required prose summary using `templates/handoff-disposition-template.md`.

## Outputs

- Revalidation closure packet
- Handoff disposition packet and prose summary
- Next-step decision (`continue`, `accept`, `escalate`)
