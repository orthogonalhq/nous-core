---
template: direct-remediation-report-template
description: Packet template for direct self-repair execution evidence.
---

# Direct Remediation Report Template

Use this packet when implementation mode is `direct`.

## Unified Template

```md
---
nous:
  v: 1
  direction: ingress
  type: handoff
  workflow: self-repair-orchestration-sop
  emitter_role: orchestration_agent
  target_role: Cortex
  action: direct_remediation_report
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: direct-remediation-report.v1
  artifact_type: self-repair-execution
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
      implementation_mode: direct
      plan_ref: .worklog/benchmarks/self-repair/full-plan-todo.mdx
---

# Direct Remediation Report

- changed_paths:
  - [PATH_1]
- verification_summary: [VERIFICATION_SUMMARY]
- residual_risks: [RISKS_OR_NA]
```
