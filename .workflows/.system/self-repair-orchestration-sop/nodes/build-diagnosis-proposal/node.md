---
nous:
  v: 2
  kind: workflow_node
  id: build-diagnosis-proposal
  skill: self-repair-orchestration-sop
  templates:
    - orchestration-agent-diagnosis-proposal-template
---

# Build Diagnosis Proposal

## Purpose

Produce deterministic diagnosis and remediation proposal with implementation
options.

## Inputs

- Self-repair intent packet
- Compiled fail context

## Procedure

1. Use `templates/orchestration-agent-diagnosis-proposal-template.md`.
2. Identify root causes and constrained remediation set.
3. For each candidate, estimate quality gain and cost.
4. Recommend implementation mode (`direct` or `dispatch-team`) with rationale.

## Outputs

- Diagnosis and remediation proposal packet
- Proposed implementation mode
