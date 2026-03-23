---
nous:
  v: 2
  kind: workflow_node
  id: start
---

# Start

## Purpose

Initialize onboarding scope and choose the correct entrypoint mode.

## Inputs

- Requested mode (`first_install`, `preference_seed_refresh`, or `memory_bootstrap_handoff`)
- Current repository posture:
  - `AGENTS.md`
  - `SOUL.md` (if present)
- Principal instruction context for this run

## Procedure

1. Confirm requested mode.
2. Read `AGENTS.md` and `SOUL.md` to establish precedence boundaries.
3. Establish run objective:
   - first install bootstrap,
   - seed refresh,
   - memory handoff only.
4. Announce scope and non-negotiables before continuing.

## Outputs

- Active run mode
- Scope statement
- Constraint summary (precedence + approval boundaries)
