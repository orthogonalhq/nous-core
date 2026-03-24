# Nous Core

## Bootstrap (Required — ALWAYS runs first)

**On every conversation start, before doing ANYTHING else:**

1. Read `AGENTS.md` — Workmode selection, SOP routing, state detection
2. Follow `AGENTS.md § State Detection and Role Inference` — detect branch, scan worklog artifacts, determine pipeline position
3. Read `SOUL.md` — Identity and collaboration posture
4. Report detected state to the user before taking action

**State recovery comes from artifacts, not memory.** Do NOT use memory files, session notes, or conversation history to determine what to work on. The branch name + worklog artifacts + work register (`.architecture/work-register.md`) are the canonical sources. Memory is for user preferences and project context — never for workflow state.

Do not skip this step. Do not begin implementation, review, or orchestration without first completing state detection.

## Project

- Monorepo: pnpm v10, Node ≥22, all code under `self/`
- Build: `tsdown` (packages), `electron-vite` (desktop)
- Lint: `oxlint`
- Tests: `vitest`
- Package manager: `pnpm`

## Constraints

- Never modify `.skills/**`, `.skills/.contracts/**`, or `AGENTS.md` during feature delivery. If process-infrastructure changes are needed, stop and split into a dedicated task.
- Conventional commits required. Commits grouped by concern.
- Branch flow: `fix/*` or `feat/*` → `dev` → `staging` → `main`. Never PR directly to main.

## Orchestrator Shim — Design/Implementation Split

**Context:** The SOP assumes a single Implementation Agent produces all six documents and codes. In practice, design gates (Goals, SDS, Implementation Plan) are produced by dedicated Design Production Agents with investigation mandates, while the coding dispatch goes to a separate Implementation Agent. The Orchestrator coordinates both autonomously — no Principal bridging needed.

**Rule: The Orchestrator owns the design gates autonomously, with investigation rigor.**

When the Orchestrator reaches implementation dispatch, do NOT emit the full implementation prompt as a single packet. Instead:

1. **Produce Goals** — dispatch a **fresh** Design Production Agent (sub-agent) that reads `.skills/engineer-workflow-sop/design-production-agent/ENTRY.md` and follows the Investigation Mandate. Then dispatch a fresh review agent. Gate the result.
2. **Produce SDS** — **fresh** Design Production Agent dispatch. Same investigation rigor. Fresh review agent gates.
3. **Produce Implementation Plan** — **fresh** Design Production Agent dispatch. Same investigation rigor. Fresh review agent gates.

**Critical:** Each design document gets its own fresh agent with fresh context. Never bundle multiple documents into one agent dispatch. The Design Production Agent ENTRY.md enforces investigation mandates — the agent must read actual source code, search for all instances of the problem pattern, and challenge the sub-phase spec's scope if investigation reveals gaps.

4. **After all three design gates are approved, commit and push all design artifacts** (worklog submodule: goals, sds, implementation-plan, reviews; parent repo: gitlink refs + any other changes). This ensures the working tree is clean before the coding dispatch.
5. **Dispatch a single Implementation Agent** (sub-agent) that bundles:
   - The approved Goals, SDS, and Implementation Plan as context
   - The phase spec and pattern reference files
   - Branch name and pre-flight instructions
   - Clear scope: "code this, run verify, produce Completion Report"
   - The Implementation Agent runs within the Orchestrator's worktree session. No separate worktree — the Orchestrator's worktree IS the execution environment.
6. **Implementation Agent returns code + Completion Report.** The Orchestrator gates the result.
7. **Orchestrator resumes** — gates the Completion Report, handles behavioral testing, User Documentation, and synthesis review.

**Worktree model:** The Orchestrator session uses `EnterWorktree` at sprint start and stays in the worktree for the entire sprint. All agents (design production, review, implementation, close) run within this worktree session as sub-agents. The main working tree stays on `dev`. Behavioral testing: the Principal checks out the feature branch in their own CLI — the Orchestrator does not leave the worktree. See `dispatch-model.md` § Worktree Lifecycle for full protocol.

**Net effect:** Fully autonomous per sub-phase. Zero manual handoffs.

**This shim extends the SOP** with a Design Production Agent role (`.skills/engineer-workflow-sop/design-production-agent/ENTRY.md`) that enforces investigation mandates. The six-document model, gate reviews, and artifact paths remain unchanged.
