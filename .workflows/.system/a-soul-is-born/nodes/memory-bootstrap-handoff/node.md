---
nous:
  v: 2
  kind: workflow_node
  id: memory-bootstrap-handoff
  skill: identity-alignment
  templates:
    - memory-bootstrap-handoff-template
---

# Memory Bootstrap Handoff

## Purpose

Prepare the `STM-LTM Bootstrap Handoff` output with explicit promotion and
rejection posture.

## Inputs

- Draft `Principal Preference Seed`
- `templates/memory-bootstrap-handoff-template.md`
- Any explicit `Do-Not-Store` guidance from the Principal

## Procedure

1. Translate approved preferences into STM adaptation rules.
2. Define which preferences are eligible for later LTM promotion and what provenance is required.
3. Record explicit rejection cases and policy guardrails.
4. Preserve proposal-only posture until the Principal approves identity-affecting persistence.

## Outputs

- `STM-LTM Bootstrap Handoff`
- Promotion guard table
- Rejection list for non-persistable identity material
