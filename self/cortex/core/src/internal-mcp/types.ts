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
  IProjectApi,
  IProjectStore,
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
  'project_discover',
  'artifact_store',
  'artifact_retrieve',
  'tool_execute',
  'tool_list',
  'witness_checkpoint',
  'escalation_notify',
  'scheduler_register',
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
  projectStore?: IProjectStore;
  pfc?: IPfcEngine;
  workflowEngine?: IWorkflowEngine;
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
