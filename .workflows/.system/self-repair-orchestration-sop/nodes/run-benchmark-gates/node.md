---
nous:
  v: 2
  kind: workflow_node
  id: run-benchmark-gates
  skill: self-repair-orchestration-sop
  templates:
    - benchmark-status-template
---

# Run Benchmark Gates

## Purpose

Evaluate nightly, weekly, and monthly benchmark guardrails before final
closure.

## Inputs

- Closure status packet
- Benchmark suite artifacts from `.worklog/benchmarks/`

## Procedure

1. Use `templates/benchmark-status-template.md`.
2. Check nightly, weekly, and monthly suite statuses.
3. Fail closed if regression guardrails are violated.
4. Emit benchmark status packet with pass or fail and evidence refs.

## Outputs

- Benchmark status packet
- Guardrail decision record
