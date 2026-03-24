---
template: revalidation-closure-template
description: Packet template for deciding closure after remediation execution.
---

# Revalidation Closure Template

Use this packet after remediation execution to decide closure.

## Unified Template

```md
---
nous:
  v: 1
  direction: internal
  type: handoff
  workflow: self-repair-orchestration-sop
  emitter_role: orchestration_agent
  target_role: Cortex
  action: self_repair_revalidation
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: revalidation-closure.v1
  artifact_type: self-repair-revalidation
  cycle: "[CYCLE_NUMBER]"
  retry:
    policy: value-proportional
    depth: iterative
    importance_tier: high
    expected_quality_gain: "[EXPECTED_QUALITY_GAIN]"
    estimated_tokens: "[ESTIMATED_TOKENS]"
    estimated_compute_minutes: "[ESTIMATED_COMPUTE_MINUTES]"
    token_price_ref: .worklog/benchmarks/pricing-rates-stub.mdx
    compute_price_ref: .worklog/benchmarks/pricing-rates-stub.mdx
    decision: continue
    decision_log_ref: .worklog/[DECISION_LOG_PATH].mdx
    benchmark_tier: nightly
    self_repair:
      required_on_fail_close: true
      orchestration_state: deferred
      approval_role: Cortex
      implementation_mode: dispatch-team
      plan_ref: .worklog/benchmarks/self-repair/full-plan-todo.mdx
---

# Revalidation Closure

- validation_checks:
  - [CHECK_1]
- validation_result: [pass|fail]
- next_decision: [continue|accept|escalate|abort]
- escalation_reason: [REASON_OR_NA]
```

`nous.retry.decision` must be set to the same runtime outcome as `next_decision`.
