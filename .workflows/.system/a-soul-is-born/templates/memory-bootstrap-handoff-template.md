---
template: memory-bootstrap-handoff-template
description: Template for the STM-LTM bootstrap handoff packet and promotion guards.
---

# Memory Bootstrap Handoff Template

Use this template for the `STM-LTM Bootstrap Handoff` output.

This is the canonical runtime packet for `a-soul-is-born` memory bootstrap
results.

## Variables

- `[HANDOFF_ID]` - Stable handoff id (default: `HF-001`)
- `[CORRELATION_ID]` - Run correlation id (for example `bootstrap-2026-02-22`)
- `[PROMOTION_GUARD_ROWS]` - Rows for promotion guard table
- `[REJECTION_ROWS]` - Rows for explicit rejection table

## Unified Template

<Response Template>
```md
---
nous:
  v: 1
  direction: egress
  type: handoff
  workflow: a-soul-is-born
  emitter_role: onboarding-agent
  target_role: memory-controller
  action: bootstrap_memory_policy
  handoff_id: "[HANDOFF_ID]"
  correlation_id: "[CORRELATION_ID]"
  payload_schema: memory-bootstrap-handoff.v1
  artifact_type: memory-bootstrap
  cycle: n/a
  retry:
    policy: value-proportional
    depth: lightweight
    importance_tier: standard
    expected_quality_gain: n/a
    estimated_tokens: n/a
    estimated_compute_minutes: n/a
    token_price_ref: .worklog/benchmarks/pricing-rates-stub.mdx
    compute_price_ref: .worklog/benchmarks/pricing-rates-stub.mdx
    decision: accept
    decision_log_ref: .worklog/[DECISION_LOG_PATH].mdx
    benchmark_tier: n/a
    self_repair:
      required_on_fail_close: true
      orchestration_state: deferred
      approval_role: cortex
      implementation_mode: direct
      plan_ref: .worklog/benchmarks/self-repair/full-plan-todo.mdx
---

# STM-LTM Bootstrap Handoff

## STM Adaptation Rules

- [rule-1]
- [rule-2]

## LTM Candidate Promotions

| Preference | Trigger | Provenance Required | Principal Approval |
|---|---|---|---|
[PROMOTION_GUARD_ROWS]

## Promotion Guards

- Never override `AGENTS.md`.
- Never override direct Principal instruction.
- Reject persistence when provenance is missing.

## Rejection List (Do-Not-Store)

| Item | Reason |
|---|---|
[REJECTION_ROWS]
```
</Response Template>
