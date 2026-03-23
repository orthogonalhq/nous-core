---
nous:
  v: 2
  kind: workflow_node
  id: finalize-self-repair-report
  skill: self-repair-orchestration-sop
---

# Finalize Self-Repair Report

## Purpose

Produce final closure report with complete traceability across intent, approval,
execution, and benchmarks.

## Inputs

- Intent, diagnosis, approval, execution, revalidation, and benchmark packets

## Procedure

1. Assemble packet refs into a single closure report.
2. Confirm every required durable `.worklog/**` reference is present.
3. Mark outcome as `closed`, `escalated`, or `blocked`.
4. Emit final report and stop.

## Outputs

- Final self-repair closure report
- Complete durable trace map
