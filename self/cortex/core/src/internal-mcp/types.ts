import type {
  AgentClass,
  AgentGatewayConfig,
  AgentResult,
  GatewayBudget,
  GatewayDispatchRequest,
  GatewayExecutionContext,
  GatewayLifecycleContext,
  GatewayStampedPacket,
  GatewayTaskCompletionRequest,
  IExternalSourceMemoryService,
  IPromotedMemoryBridgeService,
  IPublicMcpSurfaceService,
  IRuntime,
  IOpctlService,
  IProjectApi,
  IProjectStore,
  IToolExecutor,
  IWorkflowEngine,
  IWorkmodeAdmissionGuard,
  IPfcEngine,
  IScheduler,
  IScopedMcpToolSurface,
  IWitnessService,
  IEscalationService,
  ProjectId,
  ToolDefinition,
  ToolResult,
  TraceEvidenceReference,
  WorkflowNodeDefinition,
} from '@nous/shared';

export const INTERNAL_MCP_TOOL_NAMES = [
  'memory_search',
  'memory_write',
  'external_memory_put',
  'external_memory_get',
  'external_memory_search',
  'external_memory_delete',
  'external_memory_compact',
  'public_agent_list',
  'public_agent_invoke',
  'public_system_info',
  'promoted_memory_promote',
  'promoted_memory_demote',
  'promoted_memory_get',
  'promoted_memory_search',
  'project_discover',
  'artifact_store',
  'artifact_retrieve',
  'tool_execute',
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
  'dispatch_agent',
  'task_complete',
  'request_escalation',
  'flag_observation',
] as const;

export type InternalMcpToolName = (typeof INTERNAL_MCP_TOOL_NAMES)[number];

export type InternalMcpToolKind = 'capability' | 'lifecycle';

export type InternalMcpCapabilityHandler = (
  params: unknown,
  execution?: GatewayExecutionContext,
) => Promise<ToolResult>;

export type InternalMcpOutputSchemaValidationResult =
  | { success: true }
  | { success: false; issues: string[] };

export interface InternalMcpOutputSchemaValidator {
  validate(
    schemaRef: string,
    value: unknown,
    projectId?: ProjectId,
  ): Promise<InternalMcpOutputSchemaValidationResult>;
}

export interface InternalMcpDispatchChildArgs {
  request: GatewayDispatchRequest;
  context: GatewayLifecycleContext;
  budget: GatewayBudget;
}

export interface InternalMcpDispatchRuntime {
  dispatchChild(args: InternalMcpDispatchChildArgs): Promise<AgentResult>;
  buildChildBudget?(request: GatewayDispatchRequest): GatewayBudget;
}

export interface InternalMcpRuntimeDeps {
  getProjectApi?: (projectId: ProjectId) => IProjectApi | null;
  externalSourceMemoryService?: IExternalSourceMemoryService;
  promotedMemoryBridgeService?: IPromotedMemoryBridgeService;
  publicMcpSurfaceService?: IPublicMcpSurfaceService;
  projectStore?: IProjectStore;
  toolExecutor?: IToolExecutor;
  pfc?: IPfcEngine;
  workflowEngine?: IWorkflowEngine;
  opctlService?: IOpctlService;
  runtime?: IRuntime;
  instanceRoot?: string;
  workmodeAdmissionGuard?: IWorkmodeAdmissionGuard;
  witnessService?: IWitnessService;
  escalationService?: IEscalationService;
  scheduler?: IScheduler;
  outputSchemaValidator?: InternalMcpOutputSchemaValidator;
  dispatchRuntime?: InternalMcpDispatchRuntime;
  now?: () => string;
  nowMs?: () => number;
  idFactory?: () => string;
}

export interface InternalMcpHandlerContext {
  agentClass: AgentClass;
  agentId: AgentGatewayConfig['agentId'];
  deps: InternalMcpRuntimeDeps;
}

export interface InternalMcpTaskCompletionPacketArgs {
  agentClass: AgentClass;
  agentId: AgentGatewayConfig['agentId'];
  context: GatewayLifecycleContext;
  request: GatewayTaskCompletionRequest;
  payloadSchemaRef: string;
  artifactType: string;
  emittedAt: string;
  emittedAtMs: number;
  handoffId: string;
}

export interface InternalMcpTaskCompletionResult {
  output: unknown;
  v3Packet: GatewayStampedPacket;
  summary?: string;
  artifactRefs?: string[];
  evidenceRefs?: TraceEvidenceReference[];
}

export interface InternalMcpCatalogEntry {
  name: InternalMcpToolName;
  kind: InternalMcpToolKind;
  definition: ToolDefinition;
}

export interface InternalMcpGraphResolution {
  schemaRef: string;
  nodeDefinition: WorkflowNodeDefinition;
}

export interface InternalMcpScopedToolSurfaceOptions {
  agentClass: AgentClass;
  agentId: AgentGatewayConfig['agentId'];
  deps: InternalMcpRuntimeDeps;
}

export interface InternalMcpSurfaceBundle {
  toolSurface: IScopedMcpToolSurface;
  lifecycleHooks: NonNullable<AgentGatewayConfig['lifecycleHooks']>;
}
