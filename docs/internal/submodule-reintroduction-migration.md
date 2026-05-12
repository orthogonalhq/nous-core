# Submodule Reintroduction — Migration Runbook

**Status:** Active migration. Branch `feat/reintroduce-private-submodules`.
**Audience:** Internal contributors with private-clone access. Any worktree with active in-flight work in `.architecture/`, `.worklog/`, or `.skills/`.

---

## Why this is happening

`.architecture/`, `.worklog/`, and `.skills/` were git submodules until commit `35d84bbe` (2026-04-16) removed them as part of public-repo presentation cleanup. The removal solved the public-repo problem but introduced operational friction across worktrees: every cross-cutting metadata write (WR captures, AGENTS.md updates, SOP changes) requires manual cross-clone synchronization, costing ~4 hours per day across active sprints.

This PR reintroduces the submodules with explicit "private submodule, public clones may 404" labeling. Public clones gracefully degrade via the existing `AGENTS.md` conditional. Internal clones get atomic cross-worktree visibility.

## What the PR changes (parent repo, branch `feat/reintroduce-private-submodules`)

- Adds `.gitmodules` with private URLs for the three submodules. All three pinned to `main`-branch tip SHAs as of branch creation.
- Removes `/.architecture/`, `/.skills/`, `/.worklog/` from `.gitignore` (they must be parent-tracked gitlinks; the gitignore guard against re-add is comment-preserved).
- Adds a README section explaining the private-submodule stance to public viewers.
- Adds this migration runbook.

No nested-repo content is migrated by the parent PR itself. Each active worktree migrates independently per the procedure below.

## Pre-migration check (per worktree)

Before migrating ANY worktree, verify nested-repo state is at a clean checkpoint:

```bash
git -C <worktree>/.architecture status --porcelain
git -C <worktree>/.worklog status --porcelain
git -C <worktree>/.skills status --porcelain
```

Each MUST be empty. If any has uncommitted work, finish the in-flight commit + push per Artifact Persist Atomicity before proceeding. The migration must NOT clobber uncommitted nested-repo work.

Also verify each nested-repo clone has pushed everything to origin:

```bash
git -C <worktree>/.architecture log @{u}..HEAD
git -C <worktree>/.worklog log @{u}..HEAD
git -C <worktree>/.skills log @{u}..HEAD
```

Each MUST be empty (no unpushed commits).

## Migration procedure (per worktree)

Assumes the parent PR has merged to `dev` and the worktree's parent branch will eventually merge from `dev`.

1. **Note the worktree's current nested-repo branches and SHAs:**
   ```bash
   git -C <worktree>/.architecture rev-parse HEAD
   git -C <worktree>/.architecture branch --show-current
   # repeat for .worklog and .skills
   ```
   Record these — you'll restore them after submodule init.

2. **Merge `dev` (or rebase) into the worktree's parent branch** to bring in the submodule reintroduction. The merge will register the submodule gitlinks but the existing working-tree clones will continue to exist as-is.

3. **Tell git that the existing clones are the submodules.** Because `.gitmodules` already names them and the gitlinks are pinned to main-tip SHAs, but the working-tree clones may be on different branches, you need to align git's view:
   ```bash
   git submodule init
   git submodule absorbgitdirs
   ```
   `absorbgitdirs` moves each nested repo's `.git` directory into the parent's `.git/modules/<name>` location, making the nested working trees proper submodule worktrees rather than standalone clones.

4. **Switch each submodule back to its sprint branch.** `submodule absorbgitdirs` preserves working-tree content but may detach the HEAD. Restore each to the sprint branch you recorded in step 1:
   ```bash
   git -C <worktree>/.architecture checkout <sprint-branch>
   git -C <worktree>/.worklog checkout <sprint-branch>
   git -C <worktree>/.skills checkout <sprint-branch>
   ```
   Verify with `git -C <worktree>/<repo> branch --show-current` — must NOT be empty (no detached HEAD).

5. **Verify the parent doesn't think the submodules are dirty.** Each submodule may show as "modified content" in the parent's `git status` because the working-tree HEAD differs from the pinned SHA. That's fine and expected during a sprint — DO NOT bump the parent's submodule pin on every sprint commit. The submodule pin is bumped at phase-close / dev-merge boundaries.

6. **Continue the sprint.** Artifact Persist Atomicity unchanged: writes still go to the nested repo's sprint branch and push to nested-repo origin. The parent's submodule pin remains unchanged during the sprint.

## When to bump the parent's submodule pin

- **Phase-close merge** to nested-repo `main` (or `dev` if that's the policy): after the merge lands, update the parent's submodule pin to the new nested-repo `main` SHA and commit on the parent's feature integration branch.
- **Cross-cutting metadata writes** that need visibility in other worktrees (WR register updates, AGENTS.md changes, SOP changes): commit + push to the relevant nested-repo branch, then update the parent's pin on `dev` so other worktrees see it on their next merge.

Day-to-day per-sprint nested-repo writes do NOT bump the parent pin. Only the boundary events do.

## What stays the same

- Branch-PR convention for nested repos (`<type>/<feature>` naming) is unchanged.
- Artifact Persist Atomicity is unchanged (write + add + commit + push to nested-repo origin in the same response).
- Public clones still work without the submodules per the `AGENTS.md` conditional.

## What goes away after migration

- The `Nested-Repo Branch Convention` section of `branch-pr-convention.md` is no longer load-bearing for branch sync — the parent gitlink is the sync point. The section can be slimmed once all active worktrees migrate.
- Per-run manual `git -C .architecture pull --ff-only` dances in worktree bootstrap (the `AGENTS.md` patch loop seen in WR-161 and WR-163) are obsolete once submodules are init'd.

## Rollback

If migration causes problems mid-sprint, the rollback is mechanical:

1. `git -C <worktree>/.architecture .git` is now at `<worktree>/.git/modules/.architecture` (after `absorbgitdirs`). Move it back: `mv <worktree>/.git/modules/.architecture/* <worktree>/.architecture/.git/` (or restore from a backup taken before migration).
2. Revert the parent's merge of `feat/reintroduce-private-submodules`.
3. Re-add `/.architecture/`, `/.skills/`, `/.worklog/` to `.gitignore`.

Better: don't migrate worktrees that are mid-sprint with delicate state. Wait until a phase-close boundary.

## Migration tracking

| Worktree | Status | Notes |
|---|---|---|
| `nous-core` (main tree, `dev`) | — | Authored this PR |
| `feat-shell-redesign-workspace-first-ui-system` | Pending | WR-175 SP 1.1 in-flight; migrate after Completion Report |
| `feat-system-observability-and-control` | Pending | WR-162; migrate at next sprint boundary |
| `feat-onboarding-agent-identity` | Pending | WR-161 closed; safe to migrate |
| `feat-project-model-and-settings` | Pending | WR-163; migrate after phase-1.4 close |
| `feat-chat-experience-quality` | Pending | WR-159 closed; safe to migrate |
| `feat-composable-agent-harness` | Pending | |
| `feat-workflow-from-chat` | Pending | |
| `feat-automated-testing-strategy` | Pending | |
| `bt-feat-chat-experience-quality` | Pending | |
| `codex-opencode-sop-harness` | Pending | |
| `feat-wr-132` | Pending | |
| `feat-wr-142.1.1` | Pending | |
| `fix-asset-sidebar-collapse-button` | Pending | |
| `fix-chat-state-ambient-sync-thinking` | Pending | |
| `fix-provider-type-plumbing` | Pending | |
| `fix-wr-139` | Pending | |
| `wr-148-behavioral-testing` | Pending | |

Update this table as each worktree migrates.
