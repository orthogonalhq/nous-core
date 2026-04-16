---
contract: gate-exit
scope: per-node
description: Require condition nodes to expose explicit success and fallback exits.
---

# Gate Exit Contract

## Purpose

Make the branch behavior reviewable at the package level instead of burying it
inside prose.

## Rules

- Conditional nodes must declare all expected downstream exits in `workflow.yaml`.
- `true` and `false` outputs must both be represented for binary gates.
- Downstream nodes must be able to distinguish which branch produced the input.
