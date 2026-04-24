/**
 * WR-162 SP 4 — AgentClassToolSurfaceRegistry (SUPV-SP4-004).
 *
 * V1 seed per `supervisor-scope-boundary-v1.md § Agent Class Ladder` and
 * the existing `DispatchTargetClass` split:
 *   - Cortex::Principal / Cortex::System → wildcard `'*'` (cortex tier
 *     has no scope check; SP 4 treats `'*'` as bypass in the SUP-003
 *     detector).
 *   - Orchestrator → `['dispatch_agent', ...base_orchestrator_tools]`
 *     (orchestrators may dispatch sub-agents; base tools are the
 *     read/inspect set needed for orchestration).
 *   - Worker → `base_worker_tools` WITHOUT `dispatch_agent` (Workers
 *     cannot dispatch sub-agents — this is the SUP-001 rule; the
 *     inclusion/exclusion pair is the contract grounded test).
 *
 * The seed lives here rather than in a config store because it is the
 * ratified default scope from the decision doc; overrides flow in via
 * `SupervisorServiceDeps.toolSurfaceRegistry?` at bootstrap.
 * Additions/modifications post-V1 go through the same SDS/Implementation
 * Plan discipline.
 */
import type { AgentClass } from '@nous/shared';

export interface AgentClassToolSurfaceRegistry {
  readonly getAllowedToolsForClass: (
    agentClass: AgentClass,
  ) => readonly string[];
}

const BASE_READ_TOOLS: readonly string[] = Object.freeze([
  'read_file',
  'list_dir',
  'glob',
  'grep',
  'get_status',
  'get_project_state',
]);

const BASE_WRITE_TOOLS: readonly string[] = Object.freeze([
  'write_file',
  'edit_file',
  'apply_patch',
]);

const WORKER_TOOLS: readonly string[] = Object.freeze([
  ...BASE_READ_TOOLS,
  ...BASE_WRITE_TOOLS,
  'run_bash',
  'run_powershell',
  // NOTE: `dispatch_agent` is DELIBERATELY EXCLUDED for Workers — the SUP-001
  // rule. See supervisor-scope-boundary-v1.md § Agent Class Ladder.
]);

const ORCHESTRATOR_TOOLS: readonly string[] = Object.freeze([
  ...BASE_READ_TOOLS,
  'dispatch_agent',
  'read_handoff_disposition',
  'read_gate_approval',
]);

const CORTEX_TIER_TOOLS: readonly string[] = Object.freeze(['*']);

const SURFACE_MAP: Readonly<Record<AgentClass, readonly string[]>> = Object.freeze({
  'Cortex::Principal': CORTEX_TIER_TOOLS,
  'Cortex::System': CORTEX_TIER_TOOLS,
  Orchestrator: ORCHESTRATOR_TOOLS,
  Worker: WORKER_TOOLS,
});

/**
 * Default registry instance over the V1 seed. Bootstrap may inject an
 * override (test seam + future expansion path) via
 * `SupervisorServiceDeps.toolSurfaceRegistry`.
 */
export const defaultAgentClassToolSurfaceRegistry: AgentClassToolSurfaceRegistry =
  Object.freeze({
    getAllowedToolsForClass(agentClass: AgentClass): readonly string[] {
      return SURFACE_MAP[agentClass] ?? [];
    },
  });
