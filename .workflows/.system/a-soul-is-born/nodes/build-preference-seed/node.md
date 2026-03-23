---
nous:
  v: 2
  kind: workflow_node
  id: build-preference-seed
  skill: identity-alignment
  templates:
    - principal-preference-seed-template
---

# Build Preference Seed

## Purpose

Convert collected preferences into a durable `Principal Preference Seed` artifact.

## Inputs

- Structured preference capture set
- `templates/principal-preference-seed-template.md`
- Existing `SOUL.md` (if present)

## Procedure

1. Populate the seed template with only confirmed preferences by default.
2. Keep candidate preferences in an explicit pending section.
3. Attach rationale and expected behavior impact for each seed item.
4. Include explicit approval markers:
   - ready for ratification,
   - needs Principal confirmation,
   - blocked by policy conflict.

## Outputs

- Draft `Principal Preference Seed`
- Ratification status per seed item
- Clear proposal list for `SOUL.md` alignment
