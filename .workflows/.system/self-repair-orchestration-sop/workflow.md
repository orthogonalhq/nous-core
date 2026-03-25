---
name: self-repair-orchestration-sop
description: Composite workflow package for the self-repair orchestration lane.
entrypoint: start
entrypoints:
  - start
dependencies:
  skills:
    - name: self-repair-orchestration-sop
---

# Self Repair Orchestration SOP

This workflow package extracts the orchestration topology, node content, and
packet templates from the legacy hybrid skill package while preserving the
named skill dependency that the runtime can load per node.
