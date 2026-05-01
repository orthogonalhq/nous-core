---
schema: nous-opencode-dispatch.v1
run_id: WR-163-phase-1.4-preflight-cleanup
role: "Worker::preflight-cleanup-exec"
worktree: "S:\\Localhost\\Nous\\nous-core\\.claude\\worktrees\\feat-project-model-and-settings"
sop_entrypoint: ".skills/engineer-workflow-sop/preflight-agent/ENTRY.md"
route_emitter_id: "engineer-workflow-sop::Orchestrator::phase-implementation::dispatch-preflight-cleanup"
route_target_id: "engineer-workflow-sop::Worker::preflight-cleanup-exec::execute-preflight-cleanup"
route_receive_id: "Orchestrator::engineer-workflow"
profile_id: "preflight-cleanup-exec"
runner: "claude"
model_selection: "claude-sonnet"
model_cli_arg: "sonnet"
capability_profile: "review-implementation"
transport_smoke: false
witness_authorization_id: ""
witness_ledger_path: ""
runtime_run_dir: ".opencode/state/runs/WR-163-phase-1.4-preflight-cleanup"
runtime_response_path: ".opencode/state/runs/WR-163-phase-1.4-preflight-cleanup/claude-result.json"
result_path: ".opencode/state/runs/WR-163-phase-1.4-preflight-cleanup/claude-result.json"
sop_artifacts_json: "[\"AGENTS.md\",\".skills/AGENTS.md\",\".skills/engineer-workflow-sop/preflight-agent/ENTRY.md\",\".skills/engineer-workflow-sop/shared/dispatch-model.md\",\".skills/engineer-workflow-sop/shared/revision-cycle-protocol.md\",\".skills/engineer-workflow-sop/shared/branch-pr-convention.md\",\".skills/engineer-workflow-sop/orchestrator/procedures/preflight-resolution.md\",\".skills/engineer-workflow-sop/orchestrator/responses/preflight-cleanup-complete.md\"]"
sop_artifacts:
  - "AGENTS.md"
  - ".skills/AGENTS.md"
  - ".skills/engineer-workflow-sop/preflight-agent/ENTRY.md"
  - ".skills/engineer-workflow-sop/shared/dispatch-model.md"
  - ".skills/engineer-workflow-sop/shared/revision-cycle-protocol.md"
  - ".skills/engineer-workflow-sop/shared/branch-pr-convention.md"
  - ".skills/engineer-workflow-sop/orchestrator/procedures/preflight-resolution.md"
  - ".skills/engineer-workflow-sop/orchestrator/responses/preflight-cleanup-complete.md"
expected_artifacts:
  - "AGENTS.md"
  - ".skills/AGENTS.md"
  - ".skills/engineer-workflow-sop/preflight-agent/ENTRY.md"
  - ".skills/engineer-workflow-sop/shared/dispatch-model.md"
  - ".skills/engineer-workflow-sop/shared/revision-cycle-protocol.md"
  - ".skills/engineer-workflow-sop/shared/branch-pr-convention.md"
  - ".skills/engineer-workflow-sop/orchestrator/procedures/preflight-resolution.md"
  - ".skills/engineer-workflow-sop/orchestrator/responses/preflight-cleanup-complete.md"
---

# Worker Dispatch

## Task

Resolve WR-163 Phase 1.4 pre-dispatch atomicity and branch-readiness blocker: .worklog has the prompt artifact uncommitted after prompt generation; commit/push nested repo changes, verify parent and nested repos clean, ensure target branch feat/project-model-and-settings.1.4/settings-ui-pages is checked out and pushed.

## Execution Rules

- Bootstrap the named SOP role before acting.
- Stay inside the assigned worktree.
- Write the worker response packet to the declared runtime_response_path.
- Produce and report any declared SOP artifacts separately from the runtime response packet.
- Preserve route_emitter_id and route_target_id exactly when evaluating Scope Guard.
- Include the witness_authorization_id in your final result status.
- Report blockers instead of inventing missing approvals or artifacts.
