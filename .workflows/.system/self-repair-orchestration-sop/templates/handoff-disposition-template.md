---
template: handoff-disposition-template
description: Dual-output disposition template for self-repair routing decisions.
---

# Handoff Disposition Template

Use this dual-output disposition packet whenever a self-repair handoff is
consumed and a routing decision is made.

## Unified Template

```md
---
nous:
  v: 1
  direction: internal
  type: response_packet
  workflow: self-repair-orchestration-sop
  emitter_role: orchestration_agent
  target_role: Cortex
  action: handoff_disposition
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: handoff-disposition.v1
  artifact_type: self-repair-disposition
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

source_handoff_id: [SOURCE_HANDOFF_ID]
disposition_status: [accepted|needs_revision|rejected|blocked]
decision_ref: .worklog/[DECISION_REF_PATH].mdx
next_action: [NEXT_ACTION]
next_dispatch_ref: [NEXT_DISPATCH_REF]
```

Required prose summary:

- Source handoff: `[SOURCE_HANDOFF_ID]`
- Disposition status: `[accepted|needs_revision|rejected|blocked]`
- Decision ref: `.worklog/[DECISION_REF_PATH].mdx`
- Next action: `[NEXT_ACTION]` (next dispatch: `[NEXT_DISPATCH_REF]`)
