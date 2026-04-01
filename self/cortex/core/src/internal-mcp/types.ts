import type {
  AgentClass,
  AgentGatewayConfig,
  AppCredentialRequestDescriptor as SharedAppCredentialRequestDescriptor,
  AgentResult,
  AppPermissions,
  CredentialInjectRequest,
  CredentialRevokeRequest,
  CredentialStoreRequest,
  GatewayBudget,
  DispatchIntent,
  GatewayExecutionContext,
  GatewayLifecycleContext,
  GatewayStampedPacket,
  GatewayTaskCompletionRequest,
  IExternalSourceMemoryService,
  ICredentialInjector,
  ICredentialVaultService,
  IPromotedMemoryBridgeService,
  IPublicMcpSurfaceService,
  IRuntime,
  IAppRuntimeService,
  IAppCredentialInstallService,
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
  AppHealthSnapshot,
  AppHeartbeatSignal,
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
  'workflow_validate',
  'workflow_from_spec',
  'health_report',
  'health_heartbeat',
  'credentials_store',
  'credentials_inject',
  'credentials_revoke',
  'dispatch_orchestrator',
  'dispatch_worker',
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

export interface InternalMcpDispatchChildRequest {
  targetClass: 'Orchestrator' | 'Worker';
  taskInstructions: string;
  payload?: unknown;
  nodeDefinitionId?: string;
  dispatchIntent?: DispatchIntent;
}

export interface InternalMcpDispatchChildArgs {
  request: InternalMcpDispatchChildRequest;
  context: GatewayLifecycleContext;
  budget: GatewayBudget;
}

export interface InternalMcpDispatchRuntime {
  dispatchChild(args: InternalMcpDispatchChildArgs): Promise<AgentResult>;
  buildChildBudget?(request: { budget?: Partial<GatewayBudget> }): GatewayBudget;
}

export interface InternalMcpRuntimeDeps {
  getProjectApi?: (projectId: ProjectId) => IProjectApi | null;
  getAppPermissions?: (
    appId: string,
    projectId?: ProjectId,
  ) => Pick<AppPermissions, 'credentials' | 'network'> | null;
  externalSourceMemoryService?: IExternalSourceMemoryService;
  credentialVaultService?: ICredentialVaultService;
  credentialInjector?: ICredentialInjector;
  appCredentialInstallService?: IAppCredentialInstallService;
  promotedMemoryBridgeService?: IPromotedMemoryBridgeService;
  publicMcpSurfaceService?: IPublicMcpSurfaceService;
  projectStore?: IProjectStore;
  toolExecutor?: IToolExecutor;
  pfc?: IPfcEngine;
  workflowEngine?: IWorkflowEngine;
  opctlService?: IOpctlService;
  runtime?: IRuntime;
  instanceRoot?: string;
  workmodeAdmissionGuard: IWorkmodeAdmissionGuard;
  witnessService?: IWitnessService;
  escalationService?: IEscalationService;
  scheduler?: IScheduler;
  appRuntimeService?: IAppRuntimeService;
  outputSchemaValidator?: InternalMcpOutputSchemaValidator;
  dispatchRuntime?: InternalMcpDispatchRuntime;
  addHealthIssue?: (code: string) => void;
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

export interface DynamicInternalMcpToolEntry {
  name: string;
  kind: 'capability';
  definition: ToolDefinition;
  execute: InternalMcpCapabilityHandler;
  sessionId: string;
  appId: string;
  visibleTo: readonly AgentClass[];
}

export type AppHealthReportRequest = Pick<
  AppHealthSnapshot,
  'session_id' | 'status' | 'reported_at' | 'details'
>;

export type AppHeartbeatRequest = Pick<
  AppHeartbeatSignal,
  'session_id' | 'reported_at' | 'sequence' | 'status_hint'
>;

export type AppCredentialStoreRequest = CredentialStoreRequest;
export type AppCredentialInjectRequest = CredentialInjectRequest;
export type AppCredentialRevokeRequest = CredentialRevokeRequest;
export type AppCredentialRequestDescriptor = SharedAppCredentialRequestDescriptor;

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
