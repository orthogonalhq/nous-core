---
template: hygiene-scan-report-template
description: Packet template for hygiene sentry findings and severity summaries.
---

# Hygiene Scan Report Template

Use this packet for data and folder hygiene sentry findings.

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
  action: hygiene_scan_report
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: hygiene-scan-report.v1
  artifact_type: hygiene-report
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

# Hygiene Scan Report

- scan_scope: [SCAN_SCOPE]
- harmful_count: [N]
- deprecated_count: [N]
- misorganized_count: [N]
- blocking_findings:
  - [FINDING_1_OR_NA]
- evidence_ref: [EVIDENCE_REF]
```
