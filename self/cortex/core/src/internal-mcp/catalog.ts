import type { AgentClass, ToolDefinition } from '@nous/shared';
import {
  DISPATCH_AGENT_TOOL_NAME,
  FLAG_OBSERVATION_TOOL_NAME,
  REQUEST_ESCALATION_TOOL_NAME,
  TASK_COMPLETE_TOOL_NAME,
} from '../agent-gateway/lifecycle-hooks.js';
import type {
  DynamicInternalMcpToolEntry,
  InternalMcpCatalogEntry,
  InternalMcpCapabilityHandler,
  InternalMcpToolName,
} from './types.js';

function defineTool(
  name: InternalMcpToolName,
  description: string,
  inputSchema: Record<string, unknown>,
  outputSchema: Record<string, unknown>,
  capabilities: string[],
  permissionScope: string,
): ToolDefinition {
  return {
    name,
    version: '1.0.0',
    description,
    inputSchema,
    outputSchema,
    capabilities,
    permissionScope,
  };
}

export const INTERNAL_MCP_CATALOG: readonly InternalMcpCatalogEntry[] = [
  {
    name: 'memory_search',
    kind: 'capability',
    definition: defineTool(
      'memory_search',
      'Search or retrieve scoped project memory.',
      { mode: 'read | retrieve' },
      { entries: 'memory results' },
      ['read'],
      'project',
    ),
  },
  {
    name: 'memory_write',
    kind: 'capability',
    definition: defineTool(
      'memory_write',
      'Submit a governed memory write candidate.',
      { candidate: 'MemoryWriteCandidate' },
      { memoryEntryId: 'string | null' },
      ['write'],
      'project',
    ),
  },
  {
    name: 'external_memory_put',
    kind: 'capability',
    definition: defineTool(
      'external_memory_put',
      'Execute a public external-memory append or supersede write.',
      { request: 'PublicMcpExecutionRequest' },
      { entry: 'ExternalSourceMutationResult' },
      ['write'],
      'runtime',
    ),
  },
  {
    name: 'external_memory_get',
    kind: 'capability',
    definition: defineTool(
      'external_memory_get',
      'Read one public external-memory entry.',
      { request: 'PublicMcpExecutionRequest' },
      { entry: 'ExternalSourceMemoryEntry | null' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'external_memory_search',
    kind: 'capability',
    definition: defineTool(
      'external_memory_search',
      'Search public external-memory entries.',
      { request: 'PublicMcpExecutionRequest' },
      { entries: 'ExternalSourceSearchResult' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'external_memory_delete',
    kind: 'capability',
    definition: defineTool(
      'external_memory_delete',
      'Soft-delete one public external-memory entry.',
      { request: 'PublicMcpExecutionRequest' },
      { entry: 'ExternalSourceMutationResult' },
      ['write'],
      'runtime',
    ),
  },
  {
    name: 'external_memory_compact',
    kind: 'capability',
    definition: defineTool(
      'external_memory_compact',
      'Compact source-local public external memory.',
      { request: 'PublicMcpExecutionRequest' },
      { result: 'ExternalSourceCompactionResult' },
      ['write'],
      'runtime',
    ),
  },
  {
    name: 'public_agent_list',
    kind: 'capability',
    definition: defineTool(
      'public_agent_list',
      'List externally visible public agents.',
      { request: 'PublicMcpExecutionRequest' },
      { agents: 'PublicMcpAgentCatalogEntry[]' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'public_agent_invoke',
    kind: 'capability',
    definition: defineTool(
      'public_agent_invoke',
      'Invoke a public agent through the canonical AgentGateway seam.',
      { request: 'PublicMcpExecutionRequest' },
      { result: 'PublicMcpAgentInvokeResult' },
      ['execute'],
      'runtime',
    ),
  },
  {
    name: 'public_system_info',
    kind: 'capability',
    definition: defineTool(
      'public_system_info',
      'Project public-safe system and task-support metadata.',
      { request: 'PublicMcpExecutionRequest' },
      { info: 'PublicMcpSystemInfo' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'promoted_memory_promote',
    kind: 'capability',
    definition: defineTool(
      'promoted_memory_promote',
      'Promote one external source record into the internal promoted tier.',
      { command: 'PromoteExternalRecordCommand' },
      { record: 'PromotedMemoryRecord' },
      ['write'],
      'runtime',
    ),
  },
  {
    name: 'promoted_memory_demote',
    kind: 'capability',
    definition: defineTool(
      'promoted_memory_demote',
      'Soft-delete one promoted-tier record while preserving audit lineage.',
      { command: 'DemotePromotedRecordCommand' },
      { record: 'PromotedMemoryRecord' },
      ['write'],
      'runtime',
    ),
  },
  {
    name: 'promoted_memory_get',
    kind: 'capability',
    definition: defineTool(
      'promoted_memory_get',
      'Read one promoted-tier record by promoted ID.',
      { query: 'PromotedMemoryGetQuery' },
      { record: 'PromotedMemoryRecord | null' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'promoted_memory_search',
    kind: 'capability',
    definition: defineTool(
      'promoted_memory_search',
      'Search promoted-tier records without querying external source tables.',
      { query: 'PromotedMemorySearchQuery' },
      { entries: 'PromotedMemorySearchResult' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'project_discover',
    kind: 'capability',
    definition: defineTool(
      'project_discover',
      'Read current project configuration and state.',
      { includeConfig: 'boolean', includeState: 'boolean' },
      { config: 'ProjectConfig?', state: 'ProjectState?' },
      ['read'],
      'project',
    ),
  },
  {
    name: 'artifact_store',
    kind: 'capability',
    definition: defineTool(
      'artifact_store',
      'Persist a versioned project artifact.',
      { artifact: 'ArtifactWriteRequest without projectId' },
      { artifactRef: 'string', version: 'number' },
      ['write'],
      'project',
    ),
  },
  {
    name: 'artifact_retrieve',
    kind: 'capability',
    definition: defineTool(
      'artifact_retrieve',
      'Retrieve a versioned project artifact.',
      { artifact: 'ArtifactReadRequest without projectId' },
      { artifact: 'ArtifactReadResult | null' },
      ['read'],
      'project',
    ),
  },
  {
    name: 'tool_execute',
    kind: 'capability',
    definition: defineTool(
      'tool_execute',
      'Execute an external project tool.',
      { name: 'string', params: 'unknown' },
      { toolResult: 'ToolResult' },
      ['execute'],
      'project',
    ),
  },
  {
    name: 'tool_list',
    kind: 'capability',
    definition: defineTool(
      'tool_list',
      'List external project tools.',
      { capabilities: 'string[]?' },
      { tools: 'ToolDefinition[]' },
      ['read'],
      'project',
    ),
  },
  {
    name: 'witness_checkpoint',
    kind: 'capability',
    definition: defineTool(
      'witness_checkpoint',
      'Create a witness ledger checkpoint.',
      { reason: 'interval | manual | rotation' },
      { checkpointId: 'string' },
      ['write'],
      'runtime',
    ),
  },
  {
    name: 'escalation_notify',
    kind: 'capability',
    definition: defineTool(
      'escalation_notify',
      'Create a canonical in-app escalation.',
      { escalation: 'EscalationContract without projectId' },
      { escalationId: 'string' },
      ['write'],
      'project',
    ),
  },
  {
    name: 'scheduler_register',
    kind: 'capability',
    definition: defineTool(
      'scheduler_register',
      'Register a project schedule.',
      { schedule: 'ScheduleDefinition without projectId' },
      { scheduleId: 'string' },
      ['write'],
      'project',
    ),
  },
  {
    name: 'workflow_list',
    kind: 'capability',
    definition: defineTool(
      'workflow_list',
      'List installed workflow definitions and known workflow runs.',
      {
        projectId: 'ProjectId?',
        status: 'WorkflowRunStatus[]?',
        definition: 'string?',
        includeInstalledDefinitions: 'boolean?',
        includeActiveInstances: 'boolean?',
      },
      { definitions: 'WorkflowLifecycleDefinitionSummary[]', instances: 'WorkflowLifecycleInstanceSummary[]' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'workflow_inspect',
    kind: 'capability',
    definition: defineTool(
      'workflow_inspect',
      'Inspect one installed workflow package manifest, flow, steps, and dependencies.',
      { packageId: 'string' },
      { workflow: 'WorkflowLifecycleInspectResult' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'workflow_start',
    kind: 'capability',
    definition: defineTool(
      'workflow_start',
      'Resolve, preflight, and start one workflow run in a project context.',
      {
        definition: 'string',
        projectId: 'ProjectId',
        entrypoint: 'string?',
        config: 'Record<string, unknown>?',
        triggerContext: 'WorkflowRunTriggerContext?',
      },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
    ),
  },
  {
    name: 'workflow_status',
    kind: 'capability',
    definition: defineTool(
      'workflow_status',
      'Inspect the canonical status projection for one workflow run.',
      { runId: 'WorkflowExecutionId' },
      { status: 'WorkflowLifecycleStatusResult' },
      ['read'],
      'runtime',
    ),
  },
  {
    name: 'workflow_pause',
    kind: 'capability',
    definition: defineTool(
      'workflow_pause',
      'Pause a workflow run while preserving canonical run-state truth.',
      { runId: 'WorkflowExecutionId', reasonCode: 'string?' },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
    ),
  },
  {
    name: 'workflow_resume',
    kind: 'capability',
    definition: defineTool(
      'workflow_resume',
      'Resume a paused workflow run after canonical dependency preflight.',
      { runId: 'WorkflowExecutionId', reasonCode: 'string?' },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
    ),
  },
  {
    name: 'workflow_cancel',
    kind: 'capability',
    definition: defineTool(
      'workflow_cancel',
      'Cancel an in-flight workflow run without rewriting history.',
      { runId: 'WorkflowExecutionId', reasonCode: 'string?' },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
    ),
  },
  {
    name: 'health_report',
    kind: 'capability',
    definition: defineTool(
      'health_report',
      'Publish a canonical app-runtime health snapshot.',
      { session_id: 'string', status: 'healthy | degraded | unhealthy | stale', reported_at: 'ISO datetime', details: 'object?' },
      { accepted: 'boolean', health: 'AppHealthSnapshot' },
      ['write'],
      'runtime',
    ),
  },
  {
    name: 'health_heartbeat',
    kind: 'capability',
    definition: defineTool(
      'health_heartbeat',
      'Publish an app-runtime heartbeat signal.',
      { session_id: 'string', reported_at: 'ISO datetime', sequence: 'number', status_hint: 'healthy | degraded | unhealthy | stale?' },
      { accepted: 'boolean', heartbeat: 'AppHeartbeatSignal' },
      ['write'],
      'runtime',
    ),
  },
  {
    name: DISPATCH_AGENT_TOOL_NAME,
    kind: 'lifecycle',
    definition: defineTool(
      DISPATCH_AGENT_TOOL_NAME,
      'Dispatch a child agent.',
      { target_class: 'Worker | Orchestrator', task_instructions: 'string' },
      { child_result: 'AgentResult' },
      ['control'],
      'runtime',
    ),
  },
  {
    name: TASK_COMPLETE_TOOL_NAME,
    kind: 'lifecycle',
    definition: defineTool(
      TASK_COMPLETE_TOOL_NAME,
      'Complete the current task with a gateway-stamped packet.',
      { output: 'unknown', artifact_refs: 'string[]?', summary: 'string?' },
      { result: 'AgentCompletedResult' },
      ['control'],
      'runtime',
    ),
  },
  {
    name: REQUEST_ESCALATION_TOOL_NAME,
    kind: 'lifecycle',
    definition: defineTool(
      REQUEST_ESCALATION_TOOL_NAME,
      'Block and request escalation.',
      { reason: 'string', severity: 'priority', context_snapshot: 'string?' },
      { result: 'AgentEscalatedResult' },
      ['control'],
      'runtime',
    ),
  },
  {
    name: FLAG_OBSERVATION_TOOL_NAME,
    kind: 'lifecycle',
    definition: defineTool(
      FLAG_OBSERVATION_TOOL_NAME,
      'Emit a non-blocking observation.',
      { observation_type: 'string', content: 'string', detail: 'object?' },
      { observation: 'accepted' },
      ['control'],
      'runtime',
    ),
  },
] as const;

const ENTRY_BY_NAME = new Map(
  INTERNAL_MCP_CATALOG.map((entry) => [entry.name, entry] as const),
);
const DYNAMIC_ENTRY_BY_NAME = new Map<string, DynamicInternalMcpToolEntry>();

export function getInternalMcpCatalogEntry(
  name: string,
): InternalMcpCatalogEntry | null {
  return ENTRY_BY_NAME.get(name as InternalMcpToolName) ?? null;
}

export function registerDynamicInternalMcpTool(input: {
  name: string;
  definition: ToolDefinition;
  execute: InternalMcpCapabilityHandler;
  sessionId: string;
  appId: string;
  visibleTo?: readonly AgentClass[];
}): DynamicInternalMcpToolEntry {
  if (ENTRY_BY_NAME.has(input.name as InternalMcpToolName) || DYNAMIC_ENTRY_BY_NAME.has(input.name)) {
    throw new Error(`Internal MCP tool name is already registered: ${input.name}`);
  }

  const entry: DynamicInternalMcpToolEntry = {
    name: input.name,
    kind: 'capability',
    definition: input.definition,
    execute: input.execute,
    sessionId: input.sessionId,
    appId: input.appId,
    visibleTo: input.visibleTo ?? ['Worker', 'Orchestrator', 'Cortex::System'],
  };
  DYNAMIC_ENTRY_BY_NAME.set(entry.name, entry);
  return entry;
}

export function unregisterDynamicInternalMcpTool(name: string): void {
  DYNAMIC_ENTRY_BY_NAME.delete(name);
}

export function getDynamicInternalMcpToolEntry(
  name: string,
): DynamicInternalMcpToolEntry | null {
  return DYNAMIC_ENTRY_BY_NAME.get(name) ?? null;
}

export function listDynamicInternalMcpToolEntries(
  agentClass?: AgentClass,
): DynamicInternalMcpToolEntry[] {
  const entries = [...DYNAMIC_ENTRY_BY_NAME.values()];
  return agentClass
    ? entries.filter((entry) => entry.visibleTo.includes(agentClass))
    : entries;
}
