# Reinforcement Packet Contract

Status: Draft v2
Owner: Runtime/Core
Canonical location: `self/shared/contracts/`

## Purpose

Define required reinforcement and context-hydration semantics for Nous packets under repository v3-only policy.

In `nous.v: 3`, reinforcement is expressed as an inline agent directive in packet body text, not as a YAML `reinforcement` block.

## Scope

Applies to all packets with a `nous` envelope:

- `dispatch`
- `handoff`
- `response_packet`

## Core Rules (v3-only)

1. Every packet MUST use `nous.v: 3`.
2. Packets MUST NOT include a top-level YAML `reinforcement` block.
3. Packets MUST NOT include top-level `context_hydration_ack`.
4. Immediately after the YAML envelope close (`---`), packets MUST include this inline directive shape:

```text
You are the <route.target.id> agent.
1. Rehydrate context by loading every required path: <explicit comma-separated list>.
2. Execute and complete the task strictly per your SOP.
3. End your response with all required packet output(s) for this surface.
```

Missing required directive fields, mismatched identity, or presence of legacy structured markers is contract-invalid and fail-close.

## Required Reads Policy

The directive read list in step 1 MUST include, at minimum:

1. canonical global entrypoint (`AGENTS.md` or `NOUS.md` per repository policy)
2. target lane `ENTRY.md`
3. lane-required SOP/shared references
4. task/phase docs required for the current step

## Consistency Rules

1. `<route.target.id>` in directive line 1 MUST exactly equal `nous.route.target.id`.
2. Directive step 1 MUST include an explicit, concrete required-path list (no placeholders in emitted packets).
3. Directive step 2 and step 3 wording MUST preserve required semantics (`execute per SOP`, `end with required packet output(s)`).
4. Packet payload/body MUST NOT contain nested packet envelopes.

Legacy/disallowed markers in packet blocks:

- top-level YAML `reinforcement`
- top-level `context_hydration_ack`
- `reinforcement.invariants`
- reinforcement invariant mirrors (`route_emitter_id`, `route_target_id`, `envelope_type`, `envelope_action`)

## Validation Outcome

Invalid packet conditions (non-exhaustive):

- `nous.v` is not `3`
- missing inline directive
- directive target id mismatch with `nous.route.target.id`
- missing explicit required-read list in directive step 1
- disallowed legacy markers present
- nested packet envelope detected

Required response:

- fail-close
- emit `boundary_violation_escalation` or `invalid_handoff` per lane policy

## Minimal Example

```yaml
---
nous:
  v: 3
  route:
    emitter:
      id: engineer-workflow-sop::Worker::implementation::preflight-blocked
    target:
      id: engineer-workflow-sop::Orchestrator::phase-implementation::receive-preflight-blocked
  envelope:
    direction: ingress
    type: handoff
  correlation:
    handoff_id: HF-001
    correlation_id: phase-7.4-cycle-0
    cycle: n/a
    emitted_at_utc: 2026-03-02T06:37:00.000Z
    emitted_at_unix_ms: 1772433420000
    sequence_in_run: 1
  payload:
    schema: preflight-blocked.v1
    artifact_type: preflight
---
You are the engineer-workflow-sop::Orchestrator::phase-implementation::receive-preflight-blocked agent.
1. Rehydrate context by loading every required path: @AGENTS.md, @.skills/engineer-workflow-sop/orchestrator/ENTRY.md, @.skills/engineer-workflow-sop/shared/dispatch-model.md.
2. Execute and complete the task strictly per your SOP.
3. End your response with all required packet output(s) for this surface.
```
