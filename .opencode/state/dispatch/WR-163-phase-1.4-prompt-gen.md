---
schema: nous-opencode-dispatch.v1
run_id: WR-163-phase-1.4-prompt-gen
role: "Worker::prompt-gen"
worktree: "S:\\Localhost\\Nous\\nous-core\\.claude\\worktrees\\feat-project-model-and-settings"
sop_entrypoint: ".skills/engineer-workflow-sop/implementation-prompt-gen/ENTRY.md"
route_emitter_id: "engineer-workflow-sop::Orchestrator::phase-implementation::dispatch-prompt-gen"
route_target_id: "engineer-workflow-sop::Worker::prompt-gen::generate-phase-prompt"
route_receive_id: "Orchestrator::engineer-workflow"
profile_id: "prompt-gen"
runner: "claude"
model_selection: "claude-sonnet"
model_cli_arg: "sonnet"
capability_profile: "prompt-generation"
transport_smoke: false
witness_authorization_id: ""
witness_ledger_path: ""
runtime_run_dir: ".opencode/state/runs/WR-163-phase-1.4-prompt-gen"
runtime_response_path: ".opencode/state/runs/WR-163-phase-1.4-prompt-gen/claude-result.json"
result_path: ".opencode/state/runs/WR-163-phase-1.4-prompt-gen/claude-result.json"
sop_artifacts_json: "[\"AGENTS.md\",\".skills/AGENTS.md\",\".skills/engineer-workflow-sop/SKILL.md\",\".skills/engineer-workflow-sop/shared/dispatch-model.md\",\".skills/engineer-workflow-sop/shared/revision-cycle-protocol.md\",\".skills/engineer-workflow-sop/implementation-prompt-gen/ENTRY.md\",\".skills/engineer-workflow-sop/implementation-prompt-gen/templates/phase-prompt.md\",\".skills/engineer-workflow-sop/implementation-prompt-gen/responses/prompt-generated.md\"]"
sop_artifacts:
  - "AGENTS.md"
  - ".skills/AGENTS.md"
  - ".skills/engineer-workflow-sop/SKILL.md"
  - ".skills/engineer-workflow-sop/shared/dispatch-model.md"
  - ".skills/engineer-workflow-sop/shared/revision-cycle-protocol.md"
  - ".skills/engineer-workflow-sop/implementation-prompt-gen/ENTRY.md"
  - ".skills/engineer-workflow-sop/implementation-prompt-gen/templates/phase-prompt.md"
  - ".skills/engineer-workflow-sop/implementation-prompt-gen/responses/prompt-generated.md"
expected_artifacts:
  - "AGENTS.md"
  - ".skills/AGENTS.md"
  - ".skills/engineer-workflow-sop/SKILL.md"
  - ".skills/engineer-workflow-sop/shared/dispatch-model.md"
  - ".skills/engineer-workflow-sop/shared/revision-cycle-protocol.md"
  - ".skills/engineer-workflow-sop/implementation-prompt-gen/ENTRY.md"
  - ".skills/engineer-workflow-sop/implementation-prompt-gen/templates/phase-prompt.md"
  - ".skills/engineer-workflow-sop/implementation-prompt-gen/responses/prompt-generated.md"
---

# Worker Dispatch

## Task

Generate the implementation prompt artifact for WR-163 Phase 1.4 (Settings UI Pages + Dynamic project Settings category) from the SOP prompt-gen template and required inputs, then return a phase_prompt_generated packet with artifact metadata.

## Execution Rules

- Bootstrap the named SOP role before acting.
- Stay inside the assigned worktree.
- Write the worker response packet to the declared runtime_response_path.
- Produce and report any declared SOP artifacts separately from the runtime response packet.
- Preserve route_emitter_id and route_target_id exactly when evaluating Scope Guard.
- Include the witness_authorization_id in your final result status.
- Report blockers instead of inventing missing approvals or artifacts.
