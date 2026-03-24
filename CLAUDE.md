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

## Orchestrator Shim — Opus/Codex Split (Temporary)

**Context:** The SOP assumes a single Implementation Agent produces all six documents and codes. In practice, Opus 4.6 handles planning/review/orchestration and Codex GPT5.4 handles coding. The Principal manually bridges the coding dispatch to Codex. This shim minimizes manual handoffs until the SOP is updated.

**Rule: Opus owns the design gates autonomously, with investigation rigor.**

When the Orchestrator reaches implementation dispatch, do NOT emit the full implementation prompt as a single packet for the Principal to bridge. Instead:

1. **Opus produces Goals** — dispatch a **fresh** Design Production Agent (sub-agent) that reads `.skills/engineer-workflow-sop/design-production-agent/ENTRY.md` and follows the Investigation Mandate. Then dispatch a fresh review agent. Gate the result. No Principal bridging needed.
2. **Opus produces SDS** — **fresh** Design Production Agent dispatch. Same investigation rigor. Fresh review agent gates. Autonomous.
3. **Opus produces Implementation Plan** — **fresh** Design Production Agent dispatch. Same investigation rigor. Fresh review agent gates. Autonomous.

**Critical:** Each design document gets its own fresh agent with fresh context. Never bundle multiple documents into one agent dispatch. The Design Production Agent ENTRY.md enforces investigation mandates — the agent must read actual source code, search for all instances of the problem pattern, and challenge the sub-phase spec's scope if investigation reveals gaps.
4. **After all three design gates are approved, commit and push all design artifacts** (worklog submodule: goals, sds, implementation-plan, reviews; parent repo: gitlink refs + any other changes). This ensures the working tree is clean before the coding dispatch reaches the Implementation Agent's preflight check.
5. **Emit a single coding dispatch** that bundles:
   - The approved Goals, SDS, and Implementation Plan as context
   - The phase spec and pattern reference files
   - Branch name and pre-flight instructions
   - Clear scope: "code this, run verify, produce Completion Report"
   - **The Orchestrator session uses `EnterWorktree`** at sprint start and stays in the worktree for the entire sprint. Implementation agents are dispatched within this worktree session (not via `isolation: "worktree"` which creates a separate worktree). The main working tree stays on `dev`. Behavioral testing: the Principal checks out the feature branch in their own CLI — the Orchestrator does not leave the worktree.
6. **Principal bridges that one packet to Codex, or dispatches a Claude agent.** This is the only manual handoff. The agent runs within the Orchestrator's worktree session.
7. **Codex returns code + Completion Report.** Principal pastes result back.
8. **Opus resumes** — gates the Completion Report, handles behavioral testing, User Documentation, and synthesis review.

**Net effect:** ~1-2 manual handoffs instead of ~10+ per sub-phase.

**This shim extends the SOP** with a new Design Production Agent role (`.skills/engineer-workflow-sop/design-production-agent/ENTRY.md`) that enforces investigation mandates for the Opus/Codex split workflow. The six-document model, gate reviews, and artifact paths remain unchanged.
