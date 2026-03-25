# Nous Core

## Bootstrap (Required — ALWAYS runs first)

**On every conversation start, before doing ANYTHING else:**

**Packet-driven shortcut:** If this conversation begins with a fenced handoff packet (`nous.v: 3`), skip steps 1-3 below. Parse the packet's `route.target.id`, load the target ENTRY.md directly, and execute per scope guard.

**Otherwise, full bootstrap:**

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
