---
nous:
  v: 1
  kind: workflow_step
  id: collect-principal-context
name: Collect Principal Context
description: Capture stable Principal preferences that should shape Nous behavior.
type: model-call
governance: must
executionModel: synchronous
config:
  type: model-call
  modelRole: reasoner
  promptRef: workflow://a-soul-is-born/collect-principal-context
---

# Collect Principal Context

## Purpose

Capture stable Principal preferences that should shape Nous behavior.

## Inputs

- Principal-provided intent and preferences
- Existing `SOUL.md` baseline (if present)
- Relevant workflow constraints from `AGENTS.md`

## Procedure

1. Capture explicit preferences only; do not infer identity-critical traits silently.
2. Normalize preferences into durable domains:
   - communication pacing,
   - interruption tolerance,
   - trust posture,
   - decision/approval cadence,
   - documentation strictness.
3. Mark each preference as:
   - `confirmed`
   - `candidate`
   - `deferred`
4. Record conflicts against `AGENTS.md` and `SOUL.md` constraints.

## Outputs

- Structured preference capture set
- Conflict and constraint notes
- Candidate list for seed synthesis
