# AGENTS

## Operating context

### Mode Selection (Authoritative)

1. **Repository default workmode: `system:implementation`.**
2. **`system:architecture` is opt-in only.**
3. Switch modes only when the user explicitly requests it.
4. If instructions conflict, this section takes precedence.

### Skill Source Policy (Authoritative)

1. Use only project-local skills under `.skills/`.
2. `.skills/.system/` is the location for system-level project skills.
3. `.skills/.contracts/` is the canonical contracts path.
4. Do not use or reference user-home/global skill directories.

### Changelog Drift Guard (Authoritative)

1. Before making edits, determine the owning entity for each target path (for example: skill folder, architecture folder, docs module, or package folder).
2. If the owning entity contains a `CHANGELOG.md`, any file changes in that entity MUST include a same-change-set update to that `CHANGELOG.md`.
3. If multiple changelog-bearing entities are modified, update each corresponding `CHANGELOG.md`.
4. If an entity does not have a `CHANGELOG.md`, do not create one unless explicitly requested by the user or required by the active SOP.
5. Missing required changelog updates are a hard-stop compliance failure: do not report completion until resolved.

### Workmode `system:implementation`

- This is the normal mode for this development repository.
- Follow `.skills/engineer-workflow-sop/SKILL.md`.
- Project edits are allowed per the SOP.
- Mandatory form-factor gate for non-trivial capability changes: classify delivery as `function`, `skill`, or `hybrid`; record rationale; block implementation dispatch until `orchestration_agent` recommendation is ratified by `nous_cortex`.

### Identity and Personalization (Authoritative)

1. `SOUL.md` is the canonical identity/personality contract for Nous.
2. `SOUL.md` personalization guidance applies in all workmodes unless superseded by Principal instruction.
3. `SOUL.md` must not override mode/safety/process constraints in `AGENTS.md`.
4. STM/LTM-derived personalization may refine behavior, but cannot conflict with `AGENTS.md` or Principal direction.

### Identity Onboarding Skill (Authoritative)

1. On first install (or explicit identity reset), invoke `.skills/.system/a-soul-is-born/SKILL.md`.
2. Default onboarding entrypoint mode is `first_install`.
3. Required onboarding outputs:
   - Onboarding Summary
   - Principal Preference Seed
   - STM-LTM Bootstrap Handoff
   - Proposed Repository Updates
4. Identity-affecting repository updates remain proposal-only until explicit Principal approval.

### Workmode `system:architecture`

- Use only when explicitly requested by the user.
- Work only in `.architecture/`.
- Do not modify project code, `.worklog/`, or `docs/content/docs/` in `system:architecture`.
- If work is needed outside `.architecture/`, stop and ask to switch back to `system:implementation`.

## Read first

The engineering workflow for this repo is defined as a skill:

- **SOUL.md** — Canonical identity and personalization contract for Nous (read with `AGENTS.md` in all workmodes)
- **.skills/.system/a-soul-is-born/SKILL.md** — Identity onboarding flow and Principal Preference Seed bootstrap
- **.skills/engineer-workflow-sop/SKILL.md** — Full SOP: core rules, gates, testing philosophy, compliance checklist, templates
- **.skills/engineer-workflow-sop/shared/dispatch-model.md** — Agent roles, flow diagram, lifecycle rules
- **.skills/engineer-workflow-sop/shared/revision-cycle-protocol.md** — Multi-cycle revision handling

Read the SKILL.md before starting work only when in `system:implementation`.

## Project docs

Reference docs (canonical truth) are split across two locations:

- **.architecture/** — Canonical reference docs: mind model, memory system, roadmap (overview + phase specs), business model, packages & plugins (submodule: `nous-core-architecture`, private)
- **docs/content/docs/architecture/** — Architecture docs served on the docs site: repo structure, tech stack, Cortex matrix, project model, interaction surfaces

Working docs (accumulated over time):

- **.worklog/** — Accumulated artifacts: goals, SDS, implementation plans, completion reports, reviews, ADRs (submodule: `nous-core-worklog`, private)

## Scope boundary

The `.skills/` directory is process infrastructure — it defines HOW work is done (submodule: `nous-skills`, private). It is not used in `system:architecture` unless explicitly requested by the user. In normal `system:implementation` feature execution, the Implementation Agent reads process documents but does not modify them.

Exception: when the user explicitly requests process-infrastructure maintenance (for example skill creation/update/audit, namespace policy updates, or workmode naming convention updates), the acting agent may modify `.skills/` and `AGENTS.md` within that scoped task.

In `system:implementation`, project-specific docs live in `docs/content/docs/`. The Implementation Agent produces worklog artifacts in `.worklog/`.
