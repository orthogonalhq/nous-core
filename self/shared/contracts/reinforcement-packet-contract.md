# Reinforcement Packet Contract

Status: Draft v1
Owner: Runtime/Core
Canonical location: `self/shared/contracts/`

## Purpose

Define required reinforcement and context-hydration fields that MUST be present in every Nous packet.

This contract prevents role drift and compaction amnesia by making required reads and read acknowledgments machine-checkable.

## Scope

Applies to all packets with a `nous` envelope:

- `dispatch`
- `handoff`
- `response_packet`

## Core Rule

Every packet MUST include a top-level `reinforcement` block.

`context_hydration_ack` is removed. Hydration acknowledgment fields are part of `reinforcement.context_hydration`.

Missing required reinforcement/context-hydration fields is contract-invalid and fail-close.

## Required Fields

```yaml
reinforcement:
  required: true
  role_lock: <must match nous.route.target.id>
  terminal_boundary: <lane-terminal-behavior>
  fail_close_action: boundary_violation_escalation|invalid_handoff
  context_hydration:
    required: true
    read_bundle_id: <stable-id-for-this-dispatch-read-set>
    required_reads:
      - <required-doc-path-1>
      - <required-doc-path-2>
    loaded: true
    entrypoint: <lane-entrypoint-read>
    sop_refs:
      - <sop-doc-read>
    phase_refs:
      - <phase-doc-read-or-empty-list>
```

## Required Reads Policy

`reinforcement.context_hydration.required_reads` MUST include, at minimum:

1. canonical global entrypoint (`NOUS.md`; compatibility window may allow `AGENTS.md`)
2. target lane `ENTRY.md`
3. lane-required SOP/shared references
4. task/phase docs required for the current step

## Consistency Rules

1. `reinforcement.role_lock` MUST equal `nous.route.target.id`.
2. `reinforcement.context_hydration.required` MUST be `true`.
3. `reinforcement.context_hydration.loaded` MUST be `true`.
4. `reinforcement.context_hydration.entrypoint` MUST be included in `required_reads`.
5. `reinforcement.context_hydration.sop_refs` MUST be a subset of `required_reads`.
6. `reinforcement.context_hydration.phase_refs` MUST be a subset of `required_reads` (or `n/a` when phase-agnostic).
7. Packet payload/body MUST NOT contain nested packet envelopes.

Legacy/disallowed markers in packet blocks:

- top-level `context_hydration_ack`
- `reinforcement.invariants`
- reinforcement invariant mirrors (`route_emitter_id`, `route_target_id`, `envelope_type`, `envelope_action`)

## Validation Outcome

Invalid packet conditions (non-exhaustive):

- missing `reinforcement`
- missing required reinforcement/context-hydration keys
- `role_lock` does not match packet target role id
- `loaded` is not `true`
- required read categories missing
- disallowed legacy markers present
- nested packet envelope detected

Required response:

- fail-close
- emit `boundary_violation_escalation` or `invalid_handoff` per lane policy

## Minimal Example

```yaml
---
nous:
  v: 2
  route:
    emitter:
      class: Worker
      node: implementation
      id: Worker::implementation
    target:
      class: Orchestrator
      node: engineer-workflow
      id: Orchestrator::engineer-workflow
  envelope:
    direction: ingress
    type: handoff
    workflow: engineer-workflow-sop
    action: preflight_blocked
---

reinforcement:
  required: true
  role_lock: Orchestrator::engineer-workflow
  terminal_boundary: emit_and_stop
  fail_close_action: boundary_violation_escalation
  context_hydration:
    required: true
    read_bundle_id: rb-phase-4.3-preflight-001
    required_reads:
      - @AGENTS.md
      - @.skills/engineer-workflow-sop/orchestrator/ENTRY.md
      - @.skills/engineer-workflow-sop/shared/dispatch-model.md
      - @.skills/engineer-workflow-sop/shared/revision-cycle-protocol.md
      - @.skills/engineer-workflow-sop/implementation-agent/responses/preflight.md
      - @.architecture/roadmap/phase-4/phase-4.3.md
    loaded: true
    entrypoint: @.skills/engineer-workflow-sop/orchestrator/ENTRY.md
    sop_refs:
      - @.skills/engineer-workflow-sop/shared/dispatch-model.md
      - @.skills/engineer-workflow-sop/shared/revision-cycle-protocol.md
    phase_refs:
      - @.architecture/roadmap/phase-4/phase-4.3.md
```

