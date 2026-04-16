---
nous:
  v: 2
  kind: workflow_node
  id: start
  skill: self-repair-orchestration-sop
---

# Start

## Purpose

Normalize incoming self-repair trigger context and initialize run identifiers.

## Inputs

- Trigger mode (`fail_close_event`, `approved_repair_execution`, `benchmark_regression_response`, `contract_violation_event`, `manual_reopen_escalation`, `rollback_repair_event`, `post_closure_regression_event`, `hygiene_sentry_event`)
- Incoming trigger packet or benchmark evidence

## Procedure

1. Validate trigger mode and required correlation fields.
2. Bind run-scoped IDs (`handoff_id` family and `correlation_id`).
3. Initialize durable evidence destination paths under `.worklog/**`.

## Outputs

- Normalized self-repair run context
- Routing-ready mode metadata
