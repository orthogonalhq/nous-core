# Submodule Reintroduction — Migration Runbook (v2)

**Status:** Active migration. PR #365 merged to `dev` on 2026-05-13.
**Audience:** Internal contributors with private-clone access. Any worktree with active in-flight work in `.architecture/`, `.worklog/`, `.skills/`, or `.opencode/`.
**Revision:** v2 (2026-05-13) — replaces the original PR #365 runbook. Adds per-case procedures after the v1 canary surfaced a submodule-pointer conflict the v1 procedure did not address.

---

## Why this is happening

`.architecture/`, `.worklog/`, `.skills/`, and `.opencode/` were git submodules (or in the same "private nested repo" architecture) until commit `35d84bbe` (2026-04-16) removed the submodule references as part of public-repo presentation cleanup. The removal solved the public-repo problem but introduced operational friction across worktrees: every cross-cutting metadata write (WR captures, AGENTS.md updates, SOP changes) required manual cross-clone synchronization, costing ~4 hours per day across active sprints.

PR #365 (merged 2026-05-13) reintroduces the submodules with explicit "private submodule, public clones may 404" labeling. Public clones gracefully degrade via the existing `AGENTS.md` conditional. Internal clones get atomic cross-worktree visibility.

## What PR #365 already did (parent repo on `dev`)

- Added `.gitmodules` with private URLs for the four submodules. All four pinned to `main`-branch tip SHAs as of branch creation.
- Removed `/.architecture/`, `/.skills/`, `/.worklog/`, `/.opencode/` from `.gitignore`.
- Added README section explaining the private-submodule stance to public viewers.

No nested-repo content was migrated by PR #365 itself. Each active worktree migrates independently per the per-case procedure below.

---

## v1 → v2 — what changed

The original (v1) runbook assumed every worktree was a "merge dev → init → absorbgitdirs" path. The v1 canary attempt (`feat-chat-experience-quality`) revealed a conflict the v1 procedure could not auto-resolve:

```
Failed to merge submodule .worklog (commits not present)
CONFLICT (submodule): Merge conflict in .worklog
Recursive merging with submodules currently only supports trivial cases.
```

The conflict occurred because the worktree's `.worklog` was on `feat/chat-experience-quality` at SHA `11d2ba1a`, but `dev`'s submodule pin specified `.worklog` at `8e1cdc66` (main tip). Git's merge machinery cannot auto-reconcile a parent-pin-says-X vs worktree-says-Y disagreement on a submodule pointer — both branches agree the path is a submodule; they disagree on which SHA it should point to.

v2 introduces a **case selector** that routes each worktree to the right procedure based on its nested-repo state. Three cases:

| Case | Worktree nested-repo state | Procedure |
|---|---|---|
| **1 (canonical)** | Closed sprint, all nested repos already on `main` at the pinned SHA | Merge dev → init → absorbgitdirs |
| **2 (legacy-canonical)** | Closed sprint, nested repos on legacy sprint branches | Pre-align nested clones to `main`, then case 1 |
| **3 (active sprint)** | Active sprint, nested repos on sprint-feature branches with sprint-divergent SHAs | Cherry-pick the submodule reintroduction commits, manually resolve gitlink conflicts to keep worktree's current SHAs (NOT dev's pins) |

---

## Pre-migration check (run for EVERY case)

Before migrating ANY worktree, verify nested-repo state is at a clean checkpoint:

```bash
for R in .architecture .worklog .skills .opencode; do
  echo "=== $R ==="
  git -C <worktree>/$R status --porcelain
  git -C <worktree>/$R log @{u}..HEAD --oneline
done
```

Each `status --porcelain` MUST be empty. Each `log @{u}..HEAD` MUST be empty (no unpushed commits).

If anything is dirty or unpushed: finish the in-flight commit + push per Artifact Persist Atomicity BEFORE proceeding. Migration must NOT clobber uncommitted nested-repo work.

For `.opencode/` specifically: runtime state under `.opencode/state/runs/` (worker dispatch results, stderr logs) is a known recurring polluter — it must be either committed under `.worklog/` or moved out before migration. Leaving it untracked-in-place will trip `status --porcelain`. Better long-term fix: add `state/runs/`, `state/dispatch/`, and `node_modules/` to `.gitignore` inside the `nous-open-code` repo (separate small PR).

---

## Case selector — determine your case

After the pre-migration check passes, decide which case applies:

```bash
# For each nested repo, check (a) branch and (b) whether HEAD matches dev's pinned SHA.
# Dev's pinned SHAs (as of PR #365):
#   .architecture → 93bef425
#   .worklog      → 8e1cdc66
#   .skills       → 63575124
#   .opencode     → 7691c2ee

for R in .architecture .worklog .skills .opencode; do
  echo "=== $R ==="
  echo "branch: $(git -C <worktree>/$R branch --show-current)"
  echo "head:   $(git -C <worktree>/$R rev-parse HEAD)"
done
```

Then:

- **All nested repos on `main`, HEAD matches PR #365's pinned SHA** → **Case 1**
- **All nested repos on `main` BUT HEAD diverges from the pinned SHA** (because nested-repo main has moved forward since PR #365) → **Case 1** (close enough — bump pin during migration)
- **Some nested repos on legacy/closed feature branches, no current sprint** (e.g., `feat/chat-experience-quality` after WR-159 closed) → **Case 2**
- **Active sprint in flight, nested repos on the sprint's feature branches** → **Case 3**

Mixed cases (e.g., `.architecture` on main but `.worklog` on a sprint branch): treat as the highest-case-number that applies (case 2 dominates case 1; case 3 dominates case 2).

---

## Case 1 — Closed sprint, nested repos at canonical SHAs

Cleanest path. Three steps.

```bash
cd <worktree>

# 1. Merge dev (brings .gitmodules + gitlinks; no conflict because SHAs align)
git merge origin/dev

# 2. Initialize submodule machinery and absorb existing clones under parent's .git/modules/
git submodule init
git submodule absorbgitdirs

# 3. If any submodule was MISSING pre-migration (path didn't exist), `submodule init`
#    above will have left it uncloned. Populate it now:
git submodule update --init
# Freshly-cloned submodules land DETACHED at the pinned SHA. For any submodule
# whose working tree was freshly populated (not absorbed from an existing clone),
# checkout a named branch — typically `main` for closed sprints, or the sprint
# branch if you're on case 2/3:
for R in .architecture .worklog .skills .opencode; do
  CURRENT_BRANCH=$(git -C $R branch --show-current)
  if [ -z "$CURRENT_BRANCH" ]; then
    git -C $R checkout main   # or the sprint branch, per your case
  fi
done

# 4. Verify
git submodule status   # `+` prefix is OK (working tree ahead of pin); `U` is conflict
git status             # parent's "modified content" entries are OK during sprint flow
pnpm install --frozen-lockfile && pnpm build  # confirm nothing broke
```

Migration complete. The worktree is now submodule-native.

If you see `+SHA path` in `git submodule status` output (the `+` prefix), the worktree's nested clone HEAD differs from the pinned SHA. For case 1 that means nested-repo main has moved forward — bump the parent's pin:

```bash
cd <worktree>
git add .architecture .worklog .skills .opencode
git commit -m "chore(submodules): bump pins to nested-repo main tips"
git push
```

---

## Case 2 — Closed sprint, nested repos on legacy branches

Pre-align nested clones to `main` first, then run case 1 procedure.

```bash
cd <worktree>

# 1. Switch every nested clone to main and fast-forward to its tip
for R in .architecture .worklog .skills .opencode; do
  echo "=== $R ==="
  git -C $R fetch origin main
  git -C $R checkout main
  git -C $R pull --ff-only origin main
done

# 2. Now run case 1 procedure
git merge origin/dev
git submodule init
git submodule absorbgitdirs

# 3. Verify
git submodule status
git status
pnpm install --frozen-lockfile && pnpm build
```

The legacy sprint branches in the nested repos are NOT deleted — they remain in the nested repos' history. Only the local working-tree HEAD moves to main.

---

## Case 3 — Active sprint, nested repos on sprint-feature branches

The worktree is mid-sprint. Its nested-repo HEADs are on sprint feature branches that diverge from dev's submodule pins. The case 1 "merge dev" would conflict on every submodule gitlink.

The case 3 strategy: **cherry-pick the two submodule reintroduction commits from PR #365 onto the worktree's parent branch, manually resolving each gitlink conflict by KEEPING the worktree's current nested-repo SHA (not dev's pinned SHA).** Result: the worktree's parent has `.gitmodules` and gitlinks at its OWN sprint SHAs. Continues operating normally. At the worktree's eventual phase close, when it merges dev naturally, the same conflict re-surfaces and gets resolved permanently (typically by adopting the canonical pins as sub-phases close out).

### Case 3 procedure

```bash
cd <worktree>

# 1. Identify PR #365's two submodule commits on dev
git fetch origin dev
git log origin/dev --oneline | grep "feat/reintroduce-private-submodules\|reintroduce private submodules\|fourth private submodule" | head -5
# Expected: two commit SHAs — the original .architecture/.worklog/.skills add and the .opencode add.
# As of merge to dev on 2026-05-13:
#   d8e43178 chore(repo): reintroduce private submodules (.architecture, .worklog, .skills)
#   fdcbbc43 chore(repo): add .opencode as fourth private submodule

# 2. Cherry-pick them onto the worktree's parent branch
git cherry-pick d8e43178 fdcbbc43
# Expect: conflict on each gitlink path (.architecture, .worklog, .skills, .opencode)
# (Both commits will conflict because the gitlink SHAs from PR #365's pins
#  don't match this worktree's nested-repo SHAs.)

# 3. Resolve each gitlink conflict by keeping the worktree's CURRENT nested-repo SHA
#    (NOT the cherry-picked pin). For each submodule path:
for R in .architecture .worklog .skills .opencode; do
  CURRENT_SHA=$(git -C $R rev-parse HEAD)
  echo "Pinning $R at $CURRENT_SHA (worktree's current sprint SHA)"
  git update-index --add --cacheinfo 160000,$CURRENT_SHA,$R
done

# 4. Stage non-gitlink files from the cherry-pick (.gitmodules, .gitignore, README.md, runbook)
git add .gitmodules .gitignore README.md docs/internal/submodule-reintroduction-migration.md

# 5. Continue the cherry-pick
git cherry-pick --continue

# 6. Initialize submodule machinery and absorb existing clones
git submodule init
git submodule absorbgitdirs

# 7. Restore each nested clone to its sprint branch (absorbgitdirs may detach HEAD)
git -C .architecture checkout <sprint-branch>
git -C .worklog checkout <sprint-branch>
git -C .skills checkout <sprint-branch-or-main>
git -C .opencode checkout <sprint-branch-or-opencode-payload-or-main>

# 8. Verify the worktree is functional
git submodule status   # should show worktree's sprint SHAs as the pins
git status             # parent clean
pnpm install --frozen-lockfile && pnpm build
```

Migration complete. The worktree is submodule-native, parent-pinned to the worktree's own sprint SHAs.

### What case 3 leaves for later

The worktree's parent branch now has submodule pins different from `dev`'s pins. This is expected and OK during the sprint. At phase close (when the worktree's parent feature branch merges to `dev`), the natural merge will surface a submodule-pin reconciliation conflict — resolve at that point by:

- Adopting dev's pins (if the sprint's nested-repo work has already been merged to nested-repo main), OR
- Pushing the sprint's nested-repo branches and bumping dev's pins to those SHAs (if the sprint is the source of truth).

This is the canonical "feature integration → dev" merge with submodule pins — the same shape every future cross-sprint merge will have.

---

## When to bump the parent's submodule pin

- **Phase-close merge** to nested-repo `main` (or `dev` if that's the policy): after the merge lands, update the parent's submodule pin to the new nested-repo `main` SHA and commit on the parent's feature integration branch.
- **Cross-cutting metadata writes** that need visibility in other worktrees (WR register updates, AGENTS.md changes, SOP changes): commit + push to the relevant nested-repo branch, then update the parent's pin on `dev` so other worktrees see it on their next merge.

Day-to-day per-sprint nested-repo writes do NOT bump the parent pin. Only the boundary events do.

---

## Conflict-resolution recipes (reference)

### Cherry-pick adds gitlink at unexpected SHA

Symptom:
```
CONFLICT (modify/delete): .worklog deleted in HEAD and modified in d8e43178
hint: Use 'git add/rm <pathspec>' to mark resolution
```

Resolution: this means the cherry-pick wants to add a gitlink but the worktree already has the path as an untracked nested repo. Resolution is the case 3 step 3 — `git update-index --add --cacheinfo 160000,<sha>,<path>` to manually register the gitlink at the worktree's chosen SHA.

### `git submodule absorbgitdirs` errors with "Pathspec ... did not match any files"

Symptom: `absorbgitdirs` reports the path is not a known submodule.

Resolution: `git submodule init` must have run first. If it did, check `git config -l | grep submodule` — the submodule URLs should be registered. If not registered, `cat .gitmodules` and confirm the file is present and parseable.

### Nested clone HEAD is detached after `absorbgitdirs`

Symptom: `git -C .architecture branch --show-current` returns empty.

Resolution: case 1 step 3 / case 3 step 7 — explicitly checkout the sprint branch.

### Parent `git status` shows submodule as `modified: content`

Symptom: after migration, parent's `git status` shows e.g. `modified: .worklog (modified content, untracked content in submodule)`.

This is NORMAL during sprint flow — the worktree's nested-clone HEAD differs from the parent's pin. Do NOT bump the parent pin on every sprint commit. The pin moves only at phase-close / dev-merge boundaries (per "When to bump the parent's submodule pin" above).

---

## What stays the same

- Branch-PR convention for nested repos (`<type>/<feature>` naming) is unchanged.
- Artifact Persist Atomicity is unchanged (write + add + commit + push to nested-repo origin in the same response).
- Public clones still work without the submodules per the `AGENTS.md` conditional.

## What goes away after migration

- The `Nested-Repo Branch Convention` section of `branch-pr-convention.md` is no longer load-bearing for branch sync — the parent gitlink is the sync point. The section can be slimmed once all active worktrees migrate.
- Per-run manual `git -C .architecture pull --ff-only` dances in worktree bootstrap (the `AGENTS.md` patch loop seen in WR-161 and WR-163) are obsolete once submodules are init'd.

---

## Rollback

If migration causes problems mid-sprint:

1. Move the absorbed `.git` dir back. After `absorbgitdirs`, the nested repo's `.git` is at `<worktree>/.git/modules/<name>/`. To restore standalone-clone state:
   ```bash
   cd <worktree>
   for R in .architecture .worklog .skills .opencode; do
     if [ -d ".git/modules/$R" ]; then
       cp -r ".git/modules/$R" "$R/.git-restore"
       # Remove the file pointer that absorbgitdirs created in $R/.git
       rm "$R/.git"
       mv "$R/.git-restore" "$R/.git"
     fi
   done
   ```
2. Revert the parent's cherry-pick (or merge of dev), restoring the pre-submodule parent state.
3. Re-add `/.architecture/`, `/.skills/`, `/.worklog/`, `/.opencode/` to `.gitignore` (or revert that file change).

**Better than rollback: don't migrate worktrees that are mid-sprint with delicate in-flight uncommitted work.** Wait until a phase-close or sub-phase boundary where the worktree is clean.

---

## Migration tracking

Update this table as each worktree migrates. Record date, case, and any anomalies.

| Worktree | Status | Case | Date | Notes |
|---|---|---|---|---|
| `nous-core` (main tree, `dev`) | — | — | — | Authored PR #365 + this runbook v2 |
| `feat-chat-experience-quality` | **Migrated** | 2 | 2026-05-13 | WR-159 closed; case 2 CANARY for v2. Successful: 1 submodule-pin conflict on `.worklog` resolved by taking local (local was strictly newer than dev's pin); `.opencode` was missing pre-migration and auto-populated via `submodule update --init`. Post-migration `pnpm install` passed. Runbook gap surfaced: case 1/case 2 procedures need explicit "checkout named branch on freshly-cloned submodules" step (added in this same commit). |
| `feat-onboarding-agent-identity` | Pending | 2 | — | WR-161 closed; case 2 |
| `feat-wr-175-qualification` | Pending | 3 | — | WR-175 active sprint (post-Phase-1, BT-fix sub-phase in flight); case 3; migrate at next clean checkpoint, after BT round 2 closes |
| `feat-system-observability-and-control` | Pending | 3 | — | WR-162 active; case 3; migrate at sub-phase boundary |
| `feat-project-model-and-settings` | Pending | 3 | — | WR-163 active; `.worklog` DIRTY(1) — clean first |
| `feat-automated-testing-strategy` | Pending | — | — | No nested repos present; auto-populates via `git submodule update --init` |
| `bt-feat-chat-experience-quality` | Pending | — | — | No nested repos present; auto-populates |
| `codex-opencode-sop-harness` | Pending | 1 | — | Only `.skills` + `.opencode`; case 1 if both at main |
| `feat-composable-agent-harness` | Pending | — | — | No nested repos present; auto-populates |
| `feat-workflow-from-chat` | Pending | 2 | — | `.skills` DETACHED — pre-align before migration |
| `feat-wr-132` | Pending | — | — | No nested repos present; auto-populates |
| `feat-wr-142.1.1` | Pending | — | — | No nested repos present; auto-populates |
| `fix-asset-sidebar-collapse-button` | Pending | 2 | — | `.architecture`/`.worklog` on dev; `.skills` DETACHED |
| `fix-chat-state-ambient-sync-thinking` | Pending | — | — | No nested repos present; auto-populates |
| `fix-provider-type-plumbing` | Pending | 2 | — | `.skills` DETACHED |
| `fix-wr-139` | Pending | 2 | — | `.skills` DETACHED |
| `wr-148-behavioral-testing` | Pending | 2 | — | `.skills` DETACHED |

Worktrees marked "No nested repos present" don't need pre-existing-clone migration — when they merge dev next, the new `.gitmodules` lands and a `git submodule update --init --recursive` populates them fresh from main. Effectively case 1 with no working state to preserve.

---

## Validation suggested before bulk migration

Recommended canary order (least risky → most risky):

1. **`feat-chat-experience-quality`** (case 2, fully closed sprint). Validates the case 2 pre-alignment + case 1 path. Least risk because the sprint is done; nothing in flight to clobber.
2. **`feat-wr-175-qualification`** (case 3, active sprint). Validates the case 3 cherry-pick + manual resolution path. Higher risk because it's mid-sprint, but the prerequisite "clean nested-repo state" check guards against data loss. Run AFTER WR-175's current BT round closes to a clean checkpoint.

If either canary fails, do NOT bulk-migrate other worktrees. Update this runbook with the missing procedure, re-canary, then proceed.

---

## Authoritative source-of-truth

- **PR #365** (orthogonalhq/nous-core): commit history for the submodule reintroduction (commits `d8e43178` + `fdcbbc43`).
- **`.gitmodules`** in `dev` is the canonical submodule registry; this runbook references it but does not duplicate it.
- **`.architecture/work-register.md`** for WR-176 (baseline typecheck/build) and any future submodule-related WRs.
