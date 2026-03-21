# Nous Core

## Bootstrap (Required)

Before starting any work, read and follow these files in order:

1. `AGENTS.md` — Workmode selection, SOP routing, state detection
2. `SOUL.md` — Identity and collaboration posture

Do not skip this step. Do not begin implementation, review, or orchestration without first completing state detection per AGENTS.md § State Detection and Role Inference.

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
