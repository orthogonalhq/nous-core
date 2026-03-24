---
nous:
  v: 2
  kind: workflow_node
  id: compile-fail-context
  skill: self-repair-orchestration-sop
---

# Compile Fail Context

## Purpose

Collect the minimum complete failure context required for diagnosis and
approval.

## Inputs

- Trigger packet
- Prior retry decision logs
- Current benchmark evidence

## Procedure

1. Collect failing artifact refs and blocking findings.
2. Collect prior retry decisions and cost/value evidence.
3. Verify `.worklog/**` durable refs exist or mark as missing.
4. Emit compiled context summary for diagnosis step.

## Outputs

- Compiled fail context packet
- Missing-evidence list (if any)
