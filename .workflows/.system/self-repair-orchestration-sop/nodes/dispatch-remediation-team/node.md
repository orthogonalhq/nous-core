---
nous:
  v: 2
  kind: workflow_node
  id: dispatch-remediation-team
  skill: self-repair-orchestration-sop
  templates:
    - remediation-dispatch-template
---

# Dispatch Remediation Team

## Purpose

Dispatch approved remediation to specialized agents when direct mode is not
selected.

## Inputs

- Approved dispatch remediation plan
- Target role list and model requirements

## Procedure

1. Use `templates/remediation-dispatch-template.md`.
2. Emit dispatch packet(s) with canonical envelope and model requirements.
3. Collect response packet(s) and merge execution evidence.
4. Emit dispatch completion summary.

## Outputs

- Remediation dispatch packet(s)
- Dispatch completion evidence packet
