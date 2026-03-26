---
template: self-repair-intent-packet-template
description: Packet template for the fail-close to self-repair intent bridge.
---

# Self-Repair Intent Packet Template

Use this packet when a fail-close event triggers self-repair.

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
  action: self_repair_intent
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: self-repair-intent.v1
  artifact_type: self-repair-intent
  cycle: n/a
  retry:
    policy: value-proportional
    depth: lightweight
    importance_tier: critical
    expected_quality_gain: n/a
    estimated_tokens: n/a
    estimated_compute_minutes: n/a
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

# Self-Repair Intent

- fail_close_ref: [FAIL_CLOSE_REF]
- blocking_reason: [BLOCKING_REASON]
- required_outcome: [REQUIRED_OUTCOME]
- benchmark_evidence_ref: [BENCHMARK_EVIDENCE_REF]
```
