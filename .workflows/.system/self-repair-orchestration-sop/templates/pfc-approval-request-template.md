---
template: pfc-approval-request-template
description: Packet template for explicit remediation approval requests.
---

# Cortex Approval Request Template

Use this packet to request explicit remediation approval before execution.

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
  action: pfc_repair_approval_request
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: Cortex-approval-request.v1
  artifact_type: self-repair-approval
  cycle: "[CYCLE_NUMBER]"
  retry:
    policy: value-proportional
    depth: iterative
    importance_tier: critical
    expected_quality_gain: "[EXPECTED_QUALITY_GAIN]"
    estimated_tokens: "[ESTIMATED_TOKENS]"
    estimated_compute_minutes: "[ESTIMATED_COMPUTE_MINUTES]"
    token_price_ref: .worklog/benchmarks/pricing-rates-stub.mdx
    compute_price_ref: .worklog/benchmarks/pricing-rates-stub.mdx
    decision: escalate
    decision_log_ref: .worklog/[DECISION_LOG_PATH].mdx
    benchmark_tier: nightly
    self_repair:
      required_on_fail_close: true
      orchestration_state: deferred
      approval_role: Cortex
      implementation_mode: dispatch-team
      plan_ref: .worklog/benchmarks/self-repair/full-plan-todo.mdx
---

# Cortex Approval Request

- proposal_ref: [PROPOSAL_REF]
- requested_mode: [direct|dispatch-team]
- constraints: [CONSTRAINTS]
- approval_decision: [approved|rejected|conditional]
- conditions: [CONDITIONS_OR_NA]
```
