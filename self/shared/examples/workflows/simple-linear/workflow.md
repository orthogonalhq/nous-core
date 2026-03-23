---
name: simple-linear
description: Minimal composite workflow package with a trigger, an agent, and a persistence node.
entrypoint: schedule-trigger
entrypoints:
  - schedule-trigger
---

# Simple Linear

This example keeps the composite package surface intentionally small. It shows
the minimum set of files needed for a valid workflow package:

- `workflow.md` for package metadata
- `workflow.yaml` for topology
- `nodes/<id>/node.md` for per-node instructions
