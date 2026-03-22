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

**Rule: Opus owns the design gates autonomously.**

When the Orchestrator reaches implementation dispatch, do NOT emit the full implementation prompt as a single packet for the Principal to bridge. Instead:

1. **Opus produces Goals** — dispatch a sub-agent (or produce directly) using the phase spec, then dispatch a review agent. Gate the result. No Principal bridging needed.
2. **Opus produces SDS** — same pattern. Sub-agent produces, review agent gates. Autonomous.
3. **Opus produces Implementation Plan** — same pattern. Sub-agent produces, review agent gates. Autonomous.
4. **After all three design gates are approved**, emit a **single coding dispatch** that bundles:
   - The approved Goals, SDS, and Implementation Plan as context
   - The phase spec and pattern reference files
   - Branch name and pre-flight instructions
   - Clear scope: "code this, run verify, produce Completion Report"
5. **Principal bridges that one packet to Codex.** This is the only manual handoff.
6. **Codex returns code + Completion Report.** Principal pastes result back.
7. **Opus resumes** — gates the Completion Report, handles behavioral testing, User Documentation, and synthesis review.

**Net effect:** ~1-2 manual handoffs instead of ~10+ per sub-phase.

**This shim does NOT modify the SOP.** It changes how the Orchestrator sequences work within the existing role boundaries. The six-document model, gate reviews, and artifact paths remain unchanged. A proper SOP update is tracked separately.
