---
nous:
  v: 2
  kind: workflow_node
  id: route-entrypoint
  skill: self-repair-orchestration-sop
---

# Route Entrypoint

## Purpose

Select routing branch based on entrypoint mode while preserving one contract
path.

## Inputs

- Normalized run context
- Requested entrypoint mode

## Procedure

1. Route every entrypoint mode through `run-hygiene-sentry` as the required sentry subroutine.
2. For `hygiene_sentry_event`, allow sentry-only execution and terminal fast-close when no findings exist.
3. For `fail_close_event`, `contract_violation_event`, `manual_reopen_escalation`, `rollback_repair_event`, and `post_closure_regression_event`, set downstream route to `compile-fail-context`.
4. For `benchmark_regression_response`, bind benchmark evidence as primary trigger and set downstream route to `compile-fail-context`.
5. For `approved_repair_execution`, require existing approval evidence and set downstream route to `choose-implementation-mode` after sentry completion.
6. If mode is unknown or required evidence is missing, fail closed and map to `contract_violation_event`.
7. Persist route decision in durable log.

## Outputs

- Route decision record
- Context flags for downstream gating
- Approval-bypass eligibility flag for `approved_repair_execution`
- Hygiene-sentry required flag (always true)
