# Reinforcement Packet Contract

Status: Draft v0  
Owner: Runtime/Core  
Canonical location: `self/shared/contracts/`

## Purpose

Define required reinforcement and context-hydration fields that MUST be present in every Nous packet.

This contract is meant to prevent role drift and compaction amnesia by making required reads and read acknowledgments machine-checkable.

## Scope

Applies to all packets with a `nous` envelope:

- `dispatch`
- `handoff`
- `response_packet`

## Core Rule

Every packet MUST include both:

1. `reinforcement`
2. `context_hydration_ack`

Missing either is contract-invalid and fail-close.

## Required Fields

```yaml
reinforcement:
  required: true
  role_lock: <canonical-role-id>
  terminal_boundary: <lane-terminal-behavior>
  invariants:
    route_emitter_id: <must match nous.route.emitter.id>
    route_target_id: <must match nous.route.target.id>
    envelope_type: <must match nous.envelope.type>
    envelope_action: <must match nous.envelope.action>
  fail_close_action: boundary_violation_escalation|invalid_handoff
  context_hydration:
    required: true
    read_bundle_id: <stable-id-for-this-dispatch-read-set>
    required_reads:
      - <required-doc-path-1>
      - <required-doc-path-2>

context_hydration_ack:
  loaded: true
  read_bundle_id: <must match reinforcement.context_hydration.read_bundle_id>
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

1. `reinforcement.invariants.*` MUST exactly match packet header values.
2. `context_hydration_ack.read_bundle_id` MUST equal `reinforcement.context_hydration.read_bundle_id`.
3. `context_hydration_ack.entrypoint` MUST be included in `required_reads`.
4. `context_hydration_ack.sop_refs` MUST be a subset of `required_reads`.
5. `context_hydration_ack.phase_refs` MUST be a subset of `required_reads` (or empty when phase-agnostic).
6. Packet payload/body MUST NOT contain nested packet envelopes.

## Validation Outcome

Invalid packet conditions (non-exhaustive):

- missing `reinforcement`
- missing `context_hydration_ack`
- invariant/header mismatch
- `loaded` is not `true`
- `read_bundle_id` mismatch
- required reads missing required categories
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
  role_lock: Worker::implementation
  terminal_boundary: emit_and_stop
  invariants:
    route_emitter_id: Worker::implementation
    route_target_id: Orchestrator::engineer-workflow
    envelope_type: handoff
    envelope_action: preflight_blocked
  fail_close_action: boundary_violation_escalation
  context_hydration:
    required: true
    read_bundle_id: rb-phase-4.3-preflight-001
    required_reads:
      - @AGENTS.md
      - @.skills/engineer-workflow-sop/implementation-agent/ENTRY.md
      - @.skills/engineer-workflow-sop/shared/dispatch-model.md
      - @.skills/engineer-workflow-sop/shared/revision-cycle-protocol.md
      - @.skills/engineer-workflow-sop/implementation-agent/responses/preflight.md
      - @.architecture/roadmap/phase-4/phase-4.3.md

context_hydration_ack:
  loaded: true
  read_bundle_id: rb-phase-4.3-preflight-001
  entrypoint: @.skills/engineer-workflow-sop/implementation-agent/ENTRY.md
  sop_refs:
    - @.skills/engineer-workflow-sop/shared/dispatch-model.md
    - @.skills/engineer-workflow-sop/shared/revision-cycle-protocol.md
  phase_refs:
    - @.architecture/roadmap/phase-4/phase-4.3.md
```

