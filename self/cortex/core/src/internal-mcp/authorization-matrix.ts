import type { AgentClass } from '@nous/shared';
import type { InternalMcpToolName } from './types.js';

const MATRIX: Record<AgentClass, readonly InternalMcpToolName[]> = {
  'Cortex::Principal': [
    'memory_search',
    'project_discover',
    'artifact_retrieve',
    'workflow_list',
    'workflow_inspect',
    'workflow_status',
    'workflow_validate',
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
    'workflow_list',
    'workflow_inspect',
    'workflow_start',
    'workflow_status',
    'workflow_pause',
    'workflow_resume',
    'workflow_cancel',
    'workflow_validate',
    'workflow_from_spec',
    'dispatch_orchestrator',
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
    'workflow_list',
    'workflow_inspect',
    'workflow_status',
    'workflow_start',
    'workflow_pause',
    'workflow_resume',
    'dispatch_orchestrator',
    'dispatch_worker',
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
    'workflow_list',
    'workflow_inspect',
    'workflow_status',
    'task_complete',
    'request_escalation',
    'flag_observation',
  ],
};

const APP_MATRIX: readonly InternalMcpToolName[] = [
  'health_report',
  'health_heartbeat',
  'credentials_store',
  'credentials_inject',
  'credentials_revoke',
  'memory_write',
  'project_discover',
  'artifact_store',
  'artifact_retrieve',
  'tool_execute',
  'tool_list',
  'escalation_notify',
  'scheduler_register',
];

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

export function getAuthorizedAppInternalMcpTools(): ReadonlySet<InternalMcpToolName> {
  return new Set(APP_MATRIX);
}

export function isAppInternalMcpToolAuthorized(
  toolName: InternalMcpToolName,
): boolean {
  return APP_MATRIX.includes(toolName);
}
