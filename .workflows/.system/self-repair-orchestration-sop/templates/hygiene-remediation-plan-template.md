---
template: hygiene-remediation-plan-template
description: Packet template for structured hygiene remediation work.
---

# Hygiene Remediation Plan Template

Use this packet when hygiene findings require structured remediation work.

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
  action: hygiene_remediation_plan
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: hygiene-remediation-plan.v1
  artifact_type: hygiene-remediation
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

# Hygiene Remediation Plan

- source_report_ref: [HYGIENE_REPORT_REF]
- harmful_fixes:
  - [FIX_OR_NA]
- deprecated_migrations:
  - [MIGRATION_OR_NA]
- folder_reorganizations:
  - [MOVE_OR_NA]
- validation_commands:
  - [COMMAND_1]
```
