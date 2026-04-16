---
template: orchestration-agent-diagnosis-proposal-template
description: Packet template for deterministic diagnosis and remediation proposals.
---

# OrchestrationAgent Diagnosis Proposal Template

Use this packet after context compilation to propose bounded remediation.

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
  action: diagnosis_proposal_ready
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: diagnosis-proposal.v1
  artifact_type: self-repair-diagnosis
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

# Diagnosis and Remediation Proposal

- root_causes:
  - [CAUSE_1]
- remediation_options:
  - mode: direct
    summary: [DIRECT_OPTION]
  - mode: dispatch-team
    summary: [DISPATCH_OPTION]
- recommended_mode: [direct|dispatch-team]
- rationale: [RATIONALE]
```
