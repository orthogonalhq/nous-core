---
template: benchmark-status-template
description: Packet template for benchmark guardrail status reporting before closure.
---

# Benchmark Status Template

Use this packet to gate closure on benchmark suite health.

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
  action: benchmark_suite_status
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: benchmark-status.v1
  artifact_type: benchmark-status
  cycle: n/a
  retry:
    policy: value-proportional
    depth: lightweight
    importance_tier: high
    expected_quality_gain: n/a
    estimated_tokens: n/a
    estimated_compute_minutes: n/a
    token_price_ref: .worklog/benchmarks/pricing-rates-stub.mdx
    compute_price_ref: .worklog/benchmarks/pricing-rates-stub.mdx
    decision: escalate
    decision_log_ref: .worklog/[DECISION_LOG_PATH].mdx
    benchmark_tier: weekly
    self_repair:
      required_on_fail_close: true
      orchestration_state: deferred
      approval_role: Cortex
      implementation_mode: dispatch-team
      plan_ref: .worklog/benchmarks/self-repair/full-plan-todo.mdx
---

# Benchmark Status

- nightly_ref: .worklog/benchmarks/nightly/stub-latest.mdx
- weekly_ref: .worklog/benchmarks/weekly/stub-latest.mdx
- monthly_ref: .worklog/benchmarks/monthly/stub-latest.mdx
- guardrail_result: [pass|fail]
- escalation_required: [yes|no]
```
