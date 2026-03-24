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
3. `self/shared/contracts/` is the canonical path for core runtime packet contracts.
4. `.skills/.contracts/` is the canonical path for workflow/process lane contracts.
5. Do not use or reference user-home/global skill directories.

### Packet Contract (`nous.v: 3`) (Authoritative)

1. `nous.v: 3` is the canonical packet header format for this repository.
2. `route.*.id` MUST use step-qualified endpoint IDs: `<workspace>::<agent_scope>::<agent_task_or_mode>::<step>`.
3. `route.*.class`, `route.*.node`, `envelope.workflow`, and `envelope.action` are derived in v3 and MUST NOT be present.
4. YAML packet-body `reinforcement:` and top-level `context_hydration_ack` are legacy and MUST NOT be present in v3 packets.
5. Context hydration and execution instructions MUST be expressed as the inline v3 agent directive in packet body text.
6. Single-packet invariant is mandatory: one fenced packet block == one node-to-node connection, no nested packet envelopes.
7. Canonical schema and validation semantics are defined in `.skills/.contracts/handoff-contract.md` and `self/shared/contracts/reinforcement-packet-contract.md`.

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
- Engineer workflow feature-delivery lanes do not use a form-factor ratification gate. Normal sub-phase execution is assumed to target runtime/package/docs scope only; if requested work needs `.skills/**`, `.skills/.contracts/**`, or `AGENTS.md`, treat it as explicit process-infrastructure maintenance in a dedicated task/change set instead of blocking feature delivery on a `function`/`skill`/`hybrid` dossier.
- Orchestrator lane invariant: `Orchestrator::engineer-workflow` is dispatch/orchestration-only. It must not perform inline project/governance artifact authoring; artifacts are produced by worker or governance lanes and returned via handoff.

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

### State Detection and Role Inference (Authoritative)

On conversation start (or context reset), determine your operating state before taking action.

#### Step 1 — Detect sprint context

**Primary signal: thread-scoped sprint assignment.** If the conversation has an established sprint (the Principal named it, or a prior turn in this thread identified it), use that sprint's `<type>/<name>` as the context and proceed to Step 2. The main working tree may remain on `dev` — the sprint's feature branch exists in a worktree or on remote.

**Fallback: branch detection.** If no thread-scoped sprint is established, read the current git branch name:

- `main`, `staging`, `dev`: No active sprint. Route to **sprint-selection-sop**. If prior sprints exist, use `sprint_transition` mode; if no prior sprints exist, use `cold_start` mode. Read `sprint-selection-sop/SKILL.md` and `sprint-selection-sop/orchestrator/ENTRY.md`.
- `fix/<name>` or `feat/<name>` (phase branch): Active sprint root. Check for sub-phase branches.
- `fix/<name>.N/<descriptor>` or `feat/<name>.N/<descriptor>` (sub-phase branch): Active sub-phase. Proceed to Step 2.

**Parallel sprint model:** Multiple sprints may run in parallel, each in its own conversation thread with its own orchestrator. The main working tree stays on `dev`. Implementation agents are dispatched to isolated worktrees (`isolation: "worktree"`). Behavioral testing temporarily checks out the feature branch on the main tree, then returns to `dev`.

#### Step 2 — Detect workflow phase

Scan for artifacts to determine where the sprint is in the pipeline:

| Check | Path pattern | If missing | If present |
|-------|-------------|------------|------------|
| Phase 0 discovery | `.worklog/sprints/<type>/<name>/discovery/` | → **research-planning-sop**, Orchestrator role, begin Phase 0 | Check review |
| Phase 0 review | `.worklog/sprints/<type>/<name>/discovery/reviews/discovery-review.mdx` | → **research-planning-sop**, Orchestrator role, dispatch review | Check approval |
| Phase 0 approval | Discovery review verdict is `Approved` | → **research-planning-sop**, Orchestrator role, present to Principal | Proceed to decomposition check |
| Decomposition | `.architecture/roadmap/<type>/<name>/<name>.N.md` | → **engineer-workflow-sop**, Orchestrator role, dispatch decomposition | Proceed to sub-phase check |
| Sub-phase worklog | `.worklog/sprints/<type>/<name>/phase-1/phase-1.N/` | → **engineer-workflow-sop**, Orchestrator role, dispatch prompt gen | Check last artifact |

#### Step 3 — Detect sub-phase gate position

If sub-phase worklog exists, find the latest artifact to determine gate position:

| Last artifact found | Next action |
|--------------------|-------------|
| No artifacts | Dispatch Implementation Prompt Gen |
| Implementation prompt only | Dispatch Implementation Agent |
| `goals.mdx` | Dispatch Goals Review, then gate approval |
| `sds.mdx` | Dispatch SDS Review, then gate approval |
| `implementation-plan.mdx` | Dispatch Implementation Plan Review, then gate approval |
| `completion-report.mdx` | Dispatch Completion Report Review, then gate approval |
| `user-documentation.mdx` | Dispatch User Documentation Review, then gate approval |
| `review.mdx` | Dispatch Sub-phase Close |
| All artifacts + merged PR | Sub-phase complete. Check for next sub-phase or phase transition. |

#### Step 4 — Load entry point

Once SOP and role are determined:

1. Read the SOP's `SKILL.md` for orientation.
2. Read the role's `ENTRY.md` for scope guard and execution rules.
3. Read `shared/dispatch-model.md` (engineer-workflow-sop) or `shared/core-rules.md` (both SOPs) as referenced by your ENTRY.md.
4. Report current detected state to the Principal before taking action.

#### Role mapping for Claude Code

In Claude Code, the conversation typically operates as the **Orchestrator** role, dispatching sub-agents for worker roles:

| SOP Role | Claude Code mapping |
|----------|-------------------|
| Orchestrator | Main conversation thread |
| Implementation Agent | Sub-agent (Agent tool, fresh context) |
| Review Agent | Sub-agent (Agent tool, fresh context) |
| Prompt Gen Agent | Sub-agent (Agent tool, fresh context) |
| Pre-flight Cleanup Worker | Sub-agent or direct (Bash tool) |
| Sub-phase Close Worker | Sub-agent or direct (Bash tool) |
| Principal | The human user |

#### Packet-driven entry

If the conversation starts with a fenced handoff packet (`nous.v: 3`), skip state detection. Parse the packet's `route.target.id`, validate it against your role, load the target ENTRY.md, and execute per scope guard.

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
