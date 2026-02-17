# AGENTS

## Read first

The engineering workflow for this repo is defined as a skill:

- **.skills/engineer-workflow-sop/SKILL.md** — Full SOP: core rules, gates, testing philosophy, compliance checklist, templates
- **.skills/engineer-workflow-sop/shared/dispatch-model.md** — Agent roles, flow diagram, lifecycle rules
- **.skills/engineer-workflow-sop/shared/revision-cycle-protocol.md** — Multi-cycle revision handling

Read the SKILL.md before starting any work. It is the source of truth for how work moves from plan to merged code.

## Project docs

Reference docs (canonical truth) are split across two locations:

- **.architecture/** — Canonical reference docs: mind model, memory system, roadmap (overview + phase specs), business model, packages & plugins (submodule: `nous-core-architecture`, private)
- **docs/content/docs/architecture/** — Architecture docs served on the docs site: repo structure, tech stack, PFC matrix, project model, interaction surfaces

Working docs (accumulated over time):

- **.worklog/** — Accumulated artifacts: goals, SDS, implementation plans, completion reports, reviews, ADRs (submodule: `nous-core-worklog`, private)

## Scope boundary

The `.skills/` directory is process infrastructure — it defines HOW work is done (submodule: `nous-skills`, private). The Implementation Agent reads it but never modifies it. Only the PFC modifies process documents.

Project-specific docs live in `docs/content/docs/`. The Implementation Agent produces worklog artifacts in `.worklog/`.
