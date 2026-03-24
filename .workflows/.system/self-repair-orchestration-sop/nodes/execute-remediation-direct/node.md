---
nous:
  v: 2
  kind: workflow_node
  id: execute-remediation-direct
  skill: self-repair-orchestration-sop
  templates:
    - direct-remediation-report-template
---

# Execute Remediation Direct

## Purpose

Execute approved remediation directly and produce durable execution evidence.

## Inputs

- Approved direct remediation plan
- Execution prerequisites checklist

## Procedure

1. Execute direct remediation steps.
2. Use `templates/direct-remediation-report-template.md` for execution packet.
3. Record changed artifacts and verification evidence.
4. Emit direct execution report packet.

## Outputs

- Direct remediation execution report packet
- Updated artifacts and evidence refs
