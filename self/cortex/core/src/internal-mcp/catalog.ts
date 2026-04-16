import type { AgentClass, ToolDefinition } from '@nous/shared';
import {
  DISPATCH_ORCHESTRATOR_TOOL_NAME,
  DISPATCH_WORKER_TOOL_NAME,
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
  isConcurrencySafe: boolean = false,
): ToolDefinition {
  return {
    name,
    version: '1.0.0',
    description,
    inputSchema,
    outputSchema,
    capabilities,
    permissionScope,
    isConcurrencySafe,
  };
}

export const INTERNAL_MCP_CATALOG: readonly InternalMcpCatalogEntry[] = [
  {
    name: 'memory_search',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'memory_search',
      'Search or retrieve scoped project memory. Two modes: "read" (substring search across global or project scope) or "retrieve" (situation-driven recall with token budget).',
      {
        // Discriminated union on `mode`. The "read" variant requires `query`
        // and `scope`; the "retrieve" variant requires `situation` and
        // `budget` (BT Round 2, RC-3 — catalog must publish the same shape
        // the runtime handler validates against).
        type: 'object',
        oneOf: [
          {
            properties: {
              mode: { const: 'read', description: 'Substring search mode' },
              query: { type: 'string', minLength: 1, description: 'Search string' },
              scope: { enum: ['global', 'project'], description: 'Memory scope to search' },
            },
            required: ['mode', 'query', 'scope'],
            additionalProperties: false,
          },
          {
            properties: {
              mode: { const: 'retrieve', description: 'Situation-driven recall mode' },
              situation: { type: 'string', minLength: 1, description: 'Free-text situation description for ranking' },
              budget: { type: 'integer', minimum: 1, description: 'Maximum tokens to return' },
            },
            required: ['mode', 'situation', 'budget'],
            additionalProperties: false,
          },
        ],
      },
      { entries: 'memory results' },
      ['read'],
      'project',
      true,
    ),
  },
  {
    name: 'memory_write',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'memory_write',
      'Submit a governed memory write candidate.',
      {
        type: 'object',
        properties: {
          candidate: { type: 'object', description: 'MemoryWriteCandidate' },
        },
        required: ['candidate'],
      },
      { memoryEntryId: 'string | null' },
      ['write'],
      'project',
      false,
    ),
  },
  {
    name: 'external_memory_put',
    kind: 'capability',
    domain: 'bridge',
    definition: defineTool(
      'external_memory_put',
      'Execute a public external-memory append or supersede write.',
      {
        type: 'object',
        properties: {
          request: { type: 'object', description: 'PublicMcpExecutionRequest' },
        },
        required: ['request'],
      },
      { entry: 'ExternalSourceMutationResult' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'external_memory_get',
    kind: 'capability',
    domain: 'bridge',
    definition: defineTool(
      'external_memory_get',
      'Read one public external-memory entry.',
      {
        type: 'object',
        properties: {
          request: { type: 'object', description: 'PublicMcpExecutionRequest' },
        },
        required: ['request'],
      },
      { entry: 'ExternalSourceMemoryEntry | null' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'external_memory_search',
    kind: 'capability',
    domain: 'bridge',
    definition: defineTool(
      'external_memory_search',
      'Search public external-memory entries.',
      {
        type: 'object',
        properties: {
          request: { type: 'object', description: 'PublicMcpExecutionRequest' },
        },
        required: ['request'],
      },
      { entries: 'ExternalSourceSearchResult' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'external_memory_delete',
    kind: 'capability',
    domain: 'bridge',
    definition: defineTool(
      'external_memory_delete',
      'Soft-delete one public external-memory entry.',
      {
        type: 'object',
        properties: {
          request: { type: 'object', description: 'PublicMcpExecutionRequest' },
        },
        required: ['request'],
      },
      { entry: 'ExternalSourceMutationResult' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'external_memory_compact',
    kind: 'capability',
    domain: 'bridge',
    definition: defineTool(
      'external_memory_compact',
      'Compact source-local public external memory.',
      {
        type: 'object',
        properties: {
          request: { type: 'object', description: 'PublicMcpExecutionRequest' },
        },
        required: ['request'],
      },
      { result: 'ExternalSourceCompactionResult' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'public_agent_list',
    kind: 'capability',
    domain: 'bridge',
    definition: defineTool(
      'public_agent_list',
      'List externally visible public agents.',
      {
        type: 'object',
        properties: {
          request: { type: 'object', description: 'PublicMcpExecutionRequest' },
        },
        required: ['request'],
      },
      { agents: 'PublicMcpAgentCatalogEntry[]' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'public_agent_invoke',
    kind: 'capability',
    domain: 'bridge',
    definition: defineTool(
      'public_agent_invoke',
      'Invoke a public agent through the canonical AgentGateway seam.',
      {
        type: 'object',
        properties: {
          request: { type: 'object', description: 'PublicMcpExecutionRequest' },
        },
        required: ['request'],
      },
      { result: 'PublicMcpAgentInvokeResult' },
      ['execute'],
      'runtime',
      false,
    ),
  },
  {
    name: 'public_system_info',
    kind: 'capability',
    domain: 'bridge',
    definition: defineTool(
      'public_system_info',
      'Project public-safe system and task-support metadata.',
      {
        type: 'object',
        properties: {
          request: { type: 'object', description: 'PublicMcpExecutionRequest' },
        },
        required: ['request'],
      },
      { info: 'PublicMcpSystemInfo' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'promoted_memory_promote',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'promoted_memory_promote',
      'Promote one external source record into the internal promoted tier.',
      {
        type: 'object',
        properties: {
          command: { type: 'object', description: 'PromoteExternalRecordCommand' },
        },
        required: ['command'],
      },
      { record: 'PromotedMemoryRecord' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'promoted_memory_demote',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'promoted_memory_demote',
      'Soft-delete one promoted-tier record while preserving audit lineage.',
      {
        type: 'object',
        properties: {
          command: { type: 'object', description: 'DemotePromotedRecordCommand' },
        },
        required: ['command'],
      },
      { record: 'PromotedMemoryRecord' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'promoted_memory_get',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'promoted_memory_get',
      'Read one promoted-tier record by promoted ID.',
      {
        type: 'object',
        properties: {
          query: { type: 'object', description: 'PromotedMemoryGetQuery' },
        },
        required: ['query'],
      },
      { record: 'PromotedMemoryRecord | null' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'promoted_memory_search',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'promoted_memory_search',
      'Search promoted-tier records without querying external source tables.',
      {
        type: 'object',
        properties: {
          query: { type: 'object', description: 'PromotedMemorySearchQuery' },
        },
        required: ['query'],
      },
      { entries: 'PromotedMemorySearchResult' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'project_discover',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'project_discover',
      'Read current project configuration and state.',
      {
        type: 'object',
        properties: {
          includeConfig: { type: 'boolean' },
          includeState: { type: 'boolean' },
        },
        required: ['includeConfig', 'includeState'],
      },
      { config: 'ProjectConfig?', state: 'ProjectState?' },
      ['read'],
      'project',
      true,
    ),
  },
  {
    name: 'artifact_store',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'artifact_store',
      'Persist a versioned project artifact.',
      {
        type: 'object',
        properties: {
          artifact: { type: 'object', description: 'ArtifactWriteRequest without projectId' },
        },
        required: ['artifact'],
      },
      { artifactRef: 'string', version: 'number' },
      ['write'],
      'project',
      false,
    ),
  },
  {
    name: 'artifact_retrieve',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'artifact_retrieve',
      'Retrieve a versioned project artifact.',
      {
        type: 'object',
        properties: {
          artifact: { type: 'object', description: 'ArtifactReadRequest without projectId' },
        },
        required: ['artifact'],
      },
      { artifact: 'ArtifactReadResult | null' },
      ['read'],
      'project',
      true,
    ),
  },
  {
    name: 'tool_execute',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'tool_execute',
      'Execute an external project tool.',
      {
        type: 'object',
        properties: {
          name: { type: 'string' },
          params: { type: 'object', description: 'unknown' },
        },
        required: ['name', 'params'],
      },
      { toolResult: 'ToolResult' },
      ['execute'],
      'project',
      false,
    ),
  },
  {
    name: 'tool_list',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'tool_list',
      'List external project tools.',
      {
        type: 'object',
        properties: {
          capabilities: { type: 'array', description: 'string[]', items: { type: 'string' } },
        },
      },
      { tools: 'ToolDefinition[]' },
      ['read'],
      'project',
      true,
    ),
  },
  {
    name: 'witness_checkpoint',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'witness_checkpoint',
      'Create a witness ledger checkpoint.',
      {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'interval | manual | rotation' },
        },
        required: ['reason'],
      },
      { checkpointId: 'string' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'escalation_notify',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'escalation_notify',
      'Create a canonical in-app escalation.',
      {
        type: 'object',
        properties: {
          escalation: { type: 'object', description: 'EscalationContract without projectId' },
        },
        required: ['escalation'],
      },
      { escalationId: 'string' },
      ['write'],
      'project',
      false,
    ),
  },
  {
    name: 'scheduler_register',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'scheduler_register',
      'Register a project schedule.',
      {
        type: 'object',
        properties: {
          schedule: { type: 'object', description: 'ScheduleDefinition without projectId' },
        },
        required: ['schedule'],
      },
      { scheduleId: 'string' },
      ['write'],
      'project',
      false,
    ),
  },
  {
    name: 'workflow_list',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_list',
      'List installed workflow definitions and known workflow runs.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          status: { type: 'array', description: 'WorkflowRunStatus[]', items: { type: 'string' } },
          definition: { type: 'string' },
          includeInstalledDefinitions: { type: 'boolean' },
          includeActiveInstances: { type: 'boolean' },
        },
      },
      { definitions: 'WorkflowLifecycleDefinitionSummary[]', instances: 'WorkflowLifecycleInstanceSummary[]' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'workflow_inspect',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_inspect',
      'Inspect one installed workflow package manifest, flow, steps, and dependencies.',
      {
        type: 'object',
        properties: {
          packageId: { type: 'string' },
        },
        required: ['packageId'],
      },
      { workflow: 'WorkflowLifecycleInspectResult' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'workflow_start',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_start',
      'Resolve, preflight, and start one workflow run in a project context.',
      {
        type: 'object',
        properties: {
          definition: { type: 'string' },
          projectId: { type: 'string', description: 'ProjectId' },
          entrypoint: { type: 'string' },
          config: { type: 'object', description: 'Record<string, unknown>' },
          triggerContext: { type: 'object', description: 'WorkflowRunTriggerContext' },
        },
        required: ['definition', 'projectId'],
      },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_status',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_status',
      'Inspect the canonical status projection for one workflow run.',
      {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'WorkflowExecutionId' },
        },
        required: ['runId'],
      },
      { status: 'WorkflowLifecycleStatusResult' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'workflow_pause',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_pause',
      'Pause a workflow run while preserving canonical run-state truth.',
      {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'WorkflowExecutionId' },
          reasonCode: { type: 'string' },
        },
        required: ['runId'],
      },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_resume',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_resume',
      'Resume a paused workflow run after canonical dependency preflight.',
      {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'WorkflowExecutionId' },
          reasonCode: { type: 'string' },
        },
        required: ['runId'],
      },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_cancel',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_cancel',
      'Cancel an in-flight workflow run without rewriting history.',
      {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'WorkflowExecutionId' },
          reasonCode: { type: 'string' },
        },
        required: ['runId'],
      },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_validate',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_validate',
      'Validate a YAML workflow spec without executing it.',
      {
        type: 'object',
        properties: {
          yamlSpec: { type: 'string' },
        },
        required: ['yamlSpec'],
      },
      { valid: 'boolean', errors: 'WorkflowSpecValidationError[]?' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'workflow_execute_node',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_execute_node',
      'Execute an engine-internal ready node (condition, transform, quality-gate) in a running workflow.',
      {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'WorkflowExecutionId' },
          nodeDefinitionId: { type: 'string', description: 'WorkflowNodeDefinitionId' },
          payload: { type: 'object', description: 'unknown' },
        },
        required: ['runId', 'nodeDefinitionId'],
      },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_complete_node',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_complete_node',
      'Record external node completion (from Worker/Orchestrator dispatch) and advance workflow state.',
      {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'WorkflowExecutionId' },
          nodeDefinitionId: { type: 'string', description: 'WorkflowNodeDefinitionId' },
          output: { type: 'object', description: 'unknown' },
          status: { type: 'string', description: "'completed' | 'failed' (default 'completed')" },
          reasonCode: { type: 'string' },
          evidenceRefs: { type: 'array', description: 'string[]', items: { type: 'string' } },
        },
        required: ['runId', 'nodeDefinitionId'],
      },
      { result: 'WorkflowLifecycleMutationResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_from_spec',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_from_spec',
      'Create a persisted workflow definition from a YAML spec without starting it.',
      {
        type: 'object',
        properties: {
          yamlSpec: { type: 'string' },
          projectId: { type: 'string', description: 'ProjectId' },
        },
        required: ['yamlSpec', 'projectId'],
      },
      { workflowDefinitionId: 'string', definitionName: 'string' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_create',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_create',
      'Create a new persisted workflow definition from a YAML spec. Returns the generated definition ID.',
      {
        type: 'object',
        properties: {
          specYaml: { type: 'string' },
          projectId: { type: 'string', description: 'ProjectId' },
          name: { type: 'string' },
        },
        required: ['specYaml', 'projectId'],
      },
      { definitionId: 'string', definitionName: 'string' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_update',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_update',
      'Update an existing persisted workflow definition from a YAML spec. Requires the definitionId to upsert.',
      {
        type: 'object',
        properties: {
          specYaml: { type: 'string' },
          projectId: { type: 'string', description: 'ProjectId' },
          definitionId: { type: 'string' },
          name: { type: 'string' },
        },
        required: ['specYaml', 'projectId', 'definitionId'],
      },
      { definitionId: 'string', definitionName: 'string' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_delete',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_delete',
      'Delete a persisted workflow definition by ID. Clears default if the deleted definition was the default.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          definitionId: { type: 'string' },
        },
        required: ['projectId', 'definitionId'],
      },
      { deleted: 'boolean' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: 'workflow_authoring_reference',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_authoring_reference',
      'Return the complete workflow authoring reference including node catalog, YAML structure, connection syntax, validation rules, example workflow, and dispatch classification. Call before authoring WorkflowSpec YAML.',
      { type: 'object', properties: {} },
      { reference: 'string' },
      ['read'],
      'runtime',
      true,
    ),
  },
  {
    name: 'health_report',
    kind: 'capability',
    domain: 'app',
    definition: defineTool(
      'health_report',
      'Publish a canonical app-runtime health snapshot.',
      {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          status: { type: 'string', description: 'healthy | degraded | unhealthy | stale' },
          reported_at: { type: 'string', description: 'ISO datetime' },
          details: { type: 'object' },
        },
        required: ['session_id', 'status', 'reported_at'],
      },
      { accepted: 'boolean', health: 'AppHealthSnapshot' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'health_heartbeat',
    kind: 'capability',
    domain: 'app',
    definition: defineTool(
      'health_heartbeat',
      'Publish an app-runtime heartbeat signal.',
      {
        type: 'object',
        properties: {
          session_id: { type: 'string' },
          reported_at: { type: 'string', description: 'ISO datetime' },
          sequence: { type: 'number' },
          status_hint: { type: 'string', description: 'healthy | degraded | unhealthy | stale' },
        },
        required: ['session_id', 'reported_at', 'sequence'],
      },
      { accepted: 'boolean', heartbeat: 'AppHeartbeatSignal' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'credentials_store',
    kind: 'capability',
    domain: 'app',
    definition: defineTool(
      'credentials_store',
      'Store one app-scoped credential without exposing it back to the app.',
      {
        type: 'object',
        properties: {
          key: { type: 'string' },
          value: { type: 'string' },
          credential_type: { type: 'string', description: 'api_key | bearer_token | basic_auth | oauth2 | custom' },
          target_host: { type: 'string' },
          injection_location: { type: 'string', description: 'header | query | body' },
          injection_key: { type: 'string' },
          expires_at: { type: 'string', description: 'ISO datetime' },
        },
        required: ['key', 'value', 'credential_type', 'target_host', 'injection_location', 'injection_key'],
      },
      { credential_ref: 'string', metadata: 'CredentialMetadata' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'credentials_inject',
    kind: 'capability',
    domain: 'app',
    definition: defineTool(
      'credentials_inject',
      'Execute one outbound request with a credential injected by infrastructure.',
      {
        type: 'object',
        properties: {
          key: { type: 'string' },
          request_descriptor: { type: 'object', description: 'AppCredentialRequestDescriptor' },
        },
        required: ['key', 'request_descriptor'],
      },
      { status: 'number', headers: 'Record<string, string>', body: 'unknown' },
      ['execute'],
      'runtime',
      false,
    ),
  },
  {
    name: 'credentials_revoke',
    kind: 'capability',
    domain: 'app',
    definition: defineTool(
      'credentials_revoke',
      'Revoke one app-scoped credential and remove it from the vault.',
      {
        type: 'object',
        properties: {
          key: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['key'],
      },
      { revoked: 'boolean', credential_ref: 'string?' },
      ['write'],
      'runtime',
      false,
    ),
  },
  {
    name: 'task_list',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'task_list',
      'List task definitions for a project.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
        },
        required: ['projectId'],
      },
      { tasks: 'TaskDefinition[]' },
      ['read'],
      'project',
      true,
    ),
  },
  {
    name: 'task_get',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'task_get',
      'Get a task definition by ID.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          taskId: { type: 'string', description: 'UUID' },
        },
        required: ['projectId', 'taskId'],
      },
      { task: 'TaskDefinition' },
      ['read'],
      'project',
      true,
    ),
  },
  {
    name: 'task_create',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'task_create',
      'Create a new task definition.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          task: { type: 'object', description: 'TaskCreateInput' },
        },
        required: ['projectId', 'task'],
      },
      { task: 'TaskDefinition' },
      ['write'],
      'project',
      false,
    ),
  },
  {
    name: 'task_update',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'task_update',
      'Update an existing task definition.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          taskId: { type: 'string', description: 'UUID' },
          updates: { type: 'object', description: 'TaskUpdateInput' },
        },
        required: ['projectId', 'taskId', 'updates'],
      },
      { task: 'TaskDefinition' },
      ['write'],
      'project',
      false,
    ),
  },
  {
    name: 'task_delete',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'task_delete',
      'Delete a task definition by ID.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          taskId: { type: 'string', description: 'UUID' },
        },
        required: ['projectId', 'taskId'],
      },
      { deleted: 'boolean' },
      ['write'],
      'project',
      false,
    ),
  },
  {
    name: 'task_toggle',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'task_toggle',
      'Toggle the enabled state of a task definition.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          taskId: { type: 'string', description: 'UUID' },
        },
        required: ['projectId', 'taskId'],
      },
      { task: 'TaskDefinition' },
      ['write'],
      'project',
      false,
    ),
  },
  {
    name: 'task_trigger',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'task_trigger',
      'Manually trigger execution of an enabled task definition.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          taskId: { type: 'string', description: 'UUID' },
        },
        required: ['projectId', 'taskId'],
      },
      { executionId: 'string', runId: 'string' },
      ['execute'],
      'project',
      false,
    ),
  },
  {
    name: 'task_history',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'task_history',
      'List execution history for a task definition.',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          taskId: { type: 'string', description: 'UUID' },
          limit: { type: 'number' },
        },
        required: ['projectId', 'taskId'],
      },
      { executions: 'TaskExecutionRecord[]' },
      ['read'],
      'project',
      true,
    ),
  },
  {
    name: 'workflow_history',
    kind: 'capability',
    domain: 'agent',
    definition: defineTool(
      'workflow_history',
      'List workflow execution history for a project. (V1 stub — returns empty array)',
      {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ProjectId' },
          limit: { type: 'number' },
        },
        required: ['projectId'],
      },
      { executions: '[]' },
      ['read'],
      'project',
      true,
    ),
  },
  {
    name: DISPATCH_ORCHESTRATOR_TOOL_NAME,
    kind: 'lifecycle',
    domain: 'agent',
    definition: defineTool(
      DISPATCH_ORCHESTRATOR_TOOL_NAME,
      'Dispatch an Orchestrator-class agent with a structured intent.',
      {
        type: 'object',
        properties: {
          dispatch_intent: { type: 'object', description: '{ type: "workflow" | "task" | "skill" | "autonomous", ... }' },
          task_instructions: { type: 'string' },
          budget: { type: 'object', description: 'GatewayBudgetOverride' },
        },
        required: ['dispatch_intent', 'task_instructions'],
      },
      { child_result: 'AgentResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: DISPATCH_WORKER_TOOL_NAME,
    kind: 'lifecycle',
    domain: 'agent',
    definition: defineTool(
      DISPATCH_WORKER_TOOL_NAME,
      'Dispatch a Worker-class agent for task execution.',
      {
        type: 'object',
        properties: {
          task_instructions: { type: 'string' },
          node_id: { type: 'string' },
          payload: { type: 'object', description: 'unknown' },
          budget: { type: 'object', description: 'GatewayBudgetOverride' },
        },
        required: ['task_instructions'],
      },
      { child_result: 'AgentResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: TASK_COMPLETE_TOOL_NAME,
    kind: 'lifecycle',
    domain: 'agent',
    definition: defineTool(
      TASK_COMPLETE_TOOL_NAME,
      'Complete the current task with a gateway-stamped packet.',
      {
        type: 'object',
        properties: {
          output: { type: 'object', description: 'unknown' },
          artifact_refs: { type: 'array', description: 'string[]', items: { type: 'string' } },
          summary: { type: 'string' },
        },
        required: ['output'],
      },
      { result: 'AgentCompletedResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: REQUEST_ESCALATION_TOOL_NAME,
    kind: 'lifecycle',
    domain: 'agent',
    definition: defineTool(
      REQUEST_ESCALATION_TOOL_NAME,
      'Block and request escalation.',
      {
        type: 'object',
        properties: {
          reason: { type: 'string' },
          severity: { type: 'string', description: 'priority' },
          context_snapshot: { type: 'string' },
        },
        required: ['reason', 'severity'],
      },
      { result: 'AgentEscalatedResult' },
      ['control'],
      'runtime',
      false,
    ),
  },
  {
    name: FLAG_OBSERVATION_TOOL_NAME,
    kind: 'lifecycle',
    domain: 'agent',
    definition: defineTool(
      FLAG_OBSERVATION_TOOL_NAME,
      'Emit a non-blocking observation.',
      {
        type: 'object',
        properties: {
          observation_type: { type: 'string' },
          content: { type: 'string' },
          detail: { type: 'object' },
        },
        required: ['observation_type', 'content'],
      },
      { observation: 'accepted' },
      ['control'],
      'runtime',
      false,
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

export function getToolsByDomain(
  domain: 'agent' | 'app' | 'bridge',
): readonly InternalMcpCatalogEntry[] {
  return INTERNAL_MCP_CATALOG.filter((entry) => entry.domain === domain);
}
