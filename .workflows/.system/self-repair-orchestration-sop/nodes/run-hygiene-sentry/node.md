---
nous:
  v: 2
  kind: workflow_node
  id: run-hygiene-sentry
  skill: self-repair-orchestration-sop
  templates:
    - hygiene-scan-report-template
    - hygiene-remediation-plan-template
---

# Run Hygiene Sentry

## Purpose

Run data and folder hygiene checks before or during self-repair routing.

## Inputs

- Repository scan scope
- Hygiene policy and prohibited-pattern list
- Existing ignore/exemption rules

## Procedure

1. Scan the target scope for findings in three classes:
   - `harmful`: potentially dangerous patterns, unsafe commands, secret leakage, or contract-breaking artifacts.
   - `deprecated`: stale paths/contracts/references that should be migrated.
   - `misorganized`: misplaced files, namespace drift, orphaned process artifacts, or folder-structure violations.
2. Emit hygiene findings using `templates/hygiene-scan-report-template.md`.
3. If findings include unresolved `harmful` items, block closure and continue to `compile-fail-context`.
4. If only `deprecated` or `misorganized` findings are present, emit remediation plan using `templates/hygiene-remediation-plan-template.md` and continue according to downstream route policy.
5. If no findings are detected and the mode is `hygiene_sentry_event`, allow terminal fast-path to `finalize-self-repair-report`.
6. If no findings are detected and downstream route policy is `approved_repair_execution`, continue to `choose-implementation-mode`.
7. Otherwise continue to `compile-fail-context`.

## Outputs

- Hygiene scan report packet
- Hygiene remediation plan packet (when needed)
- Hygiene severity summary and routing decision
