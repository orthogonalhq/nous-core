import type { ToolDefinition } from '@nous/shared';
import {
  DISPATCH_AGENT_TOOL_NAME,
  FLAG_OBSERVATION_TOOL_NAME,
  REQUEST_ESCALATION_TOOL_NAME,
  TASK_COMPLETE_TOOL_NAME,
} from '../agent-gateway/lifecycle-hooks.js';
import type { InternalMcpCatalogEntry, InternalMcpToolName } from './types.js';

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

export function getInternalMcpCatalogEntry(
  name: string,
): InternalMcpCatalogEntry | null {
  return ENTRY_BY_NAME.get(name as InternalMcpToolName) ?? null;
}
