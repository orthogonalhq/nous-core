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
3. `.skills/.contracts/` is the canonical path for workflow/process lane contracts.
4. Do not use or reference user-home/global skill directories.

### Workmode `system:implementation`

- Follow `.skills/engineer-workflow-sop/SKILL.md`.
- Project edits are allowed per the SOP.
- If requested work needs `.skills/**`, `.skills/.contracts/**`, or `AGENTS.md`, treat it as dedicated process-infrastructure maintenance.
- Orchestrator lane invariant: `Orchestrator::engineer-workflow` is dispatch/orchestration-only — no inline artifact authoring.

### Workmode `system:architecture`

- Use only when explicitly requested by the user.
- Work only in `.architecture/`.
- Do not modify project code, `.worklog/`, or `docs/content/docs/`.

### State Detection and Role Inference (Authoritative)

On conversation start (or context reset), determine your operating state before taking action.

#### Step 1 — Detect sprint context

**Keyword trigger: ideation triage.** If the Principal says "ideation triage", "promote discoveries", or equivalent, route to **research-planning-sop** orchestrator with mode `ideation_promotion`. Skip sprint/branch detection. Read `research-planning-sop/SKILL.md` and `research-planning-sop/orchestrator/ENTRY.md`, then execute `orchestrator/procedures/ideation-promotion-gate.md`.

**Primary signal: thread-scoped sprint assignment.** If the conversation has an established sprint (the Principal named it, or a prior turn in this thread identified it), use that sprint's `<type>/<name>` as the context and proceed to Step 2. The main working tree may remain on `dev` — the sprint's feature branch exists in a worktree or on remote.

**Fallback: branch detection.** If no thread-scoped sprint is established, read the current git branch name:

- `main`, `staging`, `dev`: No active sprint. Route to **sprint-selection-sop**. If prior sprints exist, use `sprint_transition` mode; if no prior sprints exist, use `cold_start` mode. Read `sprint-selection-sop/SKILL.md` and `sprint-selection-sop/orchestrator/ENTRY.md`.
- `fix/<name>` or `feat/<name>` (phase branch): Active sprint root. Check for sub-phase branches.
- `fix/<name>.N/<descriptor>` or `feat/<name>.N/<descriptor>` (sub-phase branch): Active sub-phase. Proceed to Step 2.

**Parallel sprint model:** Multiple sprints may run in parallel, each in its own conversation thread with its own orchestrator. The main working tree stays on `dev`. The Orchestrator enters a worktree (`EnterWorktree`) at sprint start and all sub-agents run within that same worktree session — never with `isolation: "worktree"`. See `dispatch-model.md § Worktree Lifecycle`.

#### Step 2 — Detect workflow phase

Scan for artifacts to determine where the sprint is in the pipeline:

| Check | Path pattern | If missing | If present |
|-------|-------------|------------|------------|
| Phase 0 discovery | `.worklog/sprints/<type>/<name>/discovery/` | → **research-planning-sop**, Orchestrator role, begin Phase 0 | Check review |
| Phase 0 review | `.worklog/sprints/<type>/<name>/discovery/reviews/discovery-review.mdx` | → **research-planning-sop**, Orchestrator role, dispatch review | Check approval |
| Phase 0 approval | Discovery review verdict is `Approved` | → **research-planning-sop**, Orchestrator role, present to Principal | Proceed to decomposition check |
| Decomposition | `.architecture/roadmap/<type>/<name>/<name>.N.md` | → **engineer-workflow-sop**, Orchestrator role, dispatch decomposition | Proceed to sub-phase check |
| Sub-phase worklog | `.worklog/sprints/<type>/<name>/phase-1/phase-1.N/` | → **engineer-workflow-sop**, Orchestrator role | Check gate position per orchestrator ENTRY.md |

#### Step 3 — Load entry point

Once SOP and role are determined:

1. Read the SOP's `SKILL.md` for orientation.
2. Read the role's `ENTRY.md` for scope guard and execution rules.
3. Read shared docs as referenced by your ENTRY.md.
4. Report current detected state to the Principal, then immediately begin executing — do not wait for confirmation.

#### Role mapping for Claude Code

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

If the conversation starts with a fenced handoff packet (`nous.v: 3`), skip state detection. Parse the packet's `route.target.id`, validate it against your role, load the target ENTRY.md, and execute per scope guard. Full packet schema: `.skills/.contracts/handoff-contract.md`.

## Read first

- **SOUL.md** — Identity, personalization, and precedence rules
- **.skills/engineer-workflow-sop/SKILL.md** — Full SOP: core rules, gates, templates
- **.skills/engineer-workflow-sop/shared/dispatch-model.md** — Agent roles, flow, lifecycle rules

Read the SKILL.md before starting work only when in `system:implementation`.

## Scope boundary

The `.skills/` directory is process infrastructure (submodule: `nous-skills`, private). In normal feature execution, the Implementation Agent reads process documents but does not modify them.

Exception: when the user explicitly requests process-infrastructure maintenance, the acting agent may modify `.skills/` and `AGENTS.md` within that scoped task.
