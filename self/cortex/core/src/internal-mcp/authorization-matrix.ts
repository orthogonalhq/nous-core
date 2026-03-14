import type { AgentClass } from '@nous/shared';
import type { InternalMcpToolName } from './types.js';

const MATRIX: Record<AgentClass, readonly InternalMcpToolName[]> = {
  'Cortex::Principal': [
    'memory_search',
    'project_discover',
    'artifact_retrieve',
  ],
  'Cortex::System': [
    'memory_search',
    'memory_write',
    'promoted_memory_promote',
    'promoted_memory_demote',
    'promoted_memory_get',
    'promoted_memory_search',
    'project_discover',
    'artifact_store',
    'artifact_retrieve',
    'tool_list',
    'witness_checkpoint',
    'escalation_notify',
    'scheduler_register',
    'dispatch_agent',
    'task_complete',
    'request_escalation',
    'flag_observation',
  ],
  Orchestrator: [
    'memory_search',
    'memory_write',
    'project_discover',
    'artifact_store',
    'artifact_retrieve',
    'tool_list',
    'witness_checkpoint',
    'escalation_notify',
    'dispatch_agent',
    'task_complete',
    'request_escalation',
    'flag_observation',
  ],
  Worker: [
    'memory_search',
    'project_discover',
    'artifact_store',
    'artifact_retrieve',
    'tool_execute',
    'tool_list',
    'task_complete',
    'request_escalation',
    'flag_observation',
  ],
};

export function getAuthorizedInternalMcpTools(
  agentClass: AgentClass,
): ReadonlySet<InternalMcpToolName> {
  return new Set(MATRIX[agentClass]);
}

export function isInternalMcpToolAuthorized(
  agentClass: AgentClass,
  toolName: InternalMcpToolName,
): boolean {
  return MATRIX[agentClass].includes(toolName);
}
