---
template: remediation-dispatch-template
description: Dispatch template for the dispatch-team remediation path.
---

# Remediation Dispatch Template

Use this dispatch prompt when implementation mode is `dispatch-team`.

## Unified Template

```text
---
nous:
  v: 1
  direction: egress
  type: dispatch
  workflow: self-repair-orchestration-sop
  emitter_role: Cortex
  target_role: implementation-agent
  action: execute_self_repair_remediation
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: remediation-dispatch.v1
  artifact_type: self-repair-execution
  cycle: "[CYCLE_NUMBER]"
  model_requirements:
    profile: review-implementation
    fallback_policy: block_if_unmet
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

You are the remediation Worker Agent.

Read:
- [DIAGNOSIS_PROPOSAL_REF]
- [APPROVAL_REF]
- [TARGET_ARTIFACT_REFS]

Execute the approved remediation only, then emit a structured completion packet.
```
