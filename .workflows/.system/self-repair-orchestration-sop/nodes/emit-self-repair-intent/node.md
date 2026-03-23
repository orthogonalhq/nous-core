---
nous:
  v: 2
  kind: workflow_node
  id: emit-self-repair-intent
  skill: self-repair-orchestration-sop
  templates:
    - self-repair-intent-packet-template
---

# Emit Self-Repair Intent

## Purpose

Emit canonical self-repair intent packet as the fail-close to remediation
bridge.

## Inputs

- Compiled fail context
- Correlation and handoff identifiers

## Procedure

1. Use `templates/self-repair-intent-packet-template.md`.
2. Fill required envelope and payload fields.
3. Persist emitted packet ref in durable log.
4. Fail closed if required fields cannot be populated.

## Outputs

- Self-repair intent packet
- Intent packet durable reference
