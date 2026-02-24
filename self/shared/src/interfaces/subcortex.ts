/**
 * Subcortex layer interface contracts.
 *
 * IModelRouter, IModelProvider, IToolExecutor, IWorkflowEngine,
 * IProjectStore, IArtifactStore, IScheduler, IEscalationService,
 * ISandbox, IProjectApi.
 */
import type {
  ProjectId,
  ProviderId,
  ArtifactId,
  MemoryEntryId,
  WorkflowExecutionId,
  EscalationId,
  ModelRole,
  MemoryScope,
  EscalationChannel,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ToolResult,
  ToolDefinition,
  WorkflowGraph,
  WorkflowState,
  ProjectConfig,
  ProjectState,
  ArtifactData,
  ArtifactMetadata,
  ArtifactFilter,
  ScheduleDefinition,
  EscalationContract,
  EscalationResponse,
  SandboxPayload,
  SandboxResult,
  MemoryEntry,
  MemoryWriteCandidate,
  RetrievalResult,
  WitnessAuthorizationInput,
  WitnessCompletionInput,
  WitnessInvariantInput,
  WitnessCheckpoint,
  WitnessCheckpointReason,
  WitnessEvent,
  VerificationReport,
  VerificationReportId,
  WitnessVerificationRequest,
  RouteContext,
  RouteResult,
} from '../types/index.js';
import type { NousEvent } from '../events/index.js';

export interface IModelRouter {
  /** Route a model role to the appropriate provider (legacy) */
  route(role: ModelRole, projectId?: ProjectId): Promise<ProviderId>;

  /** Route with evidence (Phase 2.3): returns providerId and RouteDecisionEvidence */
  routeWithEvidence(role: ModelRole, context: RouteContext): Promise<RouteResult>;

  /** List all available providers */
  listProviders(): Promise<ModelProviderConfig[]>;
}

export interface IModelProvider {
  /** Invoke the model synchronously */
  invoke(request: ModelRequest): Promise<ModelResponse>;

  /** Invoke the model with streaming response */
  stream(request: ModelRequest): AsyncIterable<ModelStreamChunk>;

  /** Get provider configuration */
  getConfig(): ModelProviderConfig;
}

export interface IToolExecutor {
  /** Execute a tool (already Cortex-authorized) */
  execute(toolName: string, params: unknown, projectId?: ProjectId): Promise<ToolResult>;

  /** List available tools and their capabilities */
  listTools(): Promise<ToolDefinition[]>;
}

export interface IWorkflowEngine {
  /** Start executing a workflow graph */
  start(projectId: ProjectId, graph: WorkflowGraph): Promise<WorkflowExecutionId>;

  /** Resume a paused workflow */
  resume(executionId: WorkflowExecutionId): Promise<void>;

  /** Pause a running workflow */
  pause(executionId: WorkflowExecutionId): Promise<void>;

  /** Get workflow execution state */
  getState(executionId: WorkflowExecutionId): Promise<WorkflowState>;
}

export interface IProjectStore {
  /** Create a new project */
  create(config: ProjectConfig): Promise<ProjectId>;

  /** Get project configuration */
  get(id: ProjectId): Promise<ProjectConfig | null>;

  /** List all projects */
  list(): Promise<ProjectConfig[]>;

  /** Update project configuration */
  update(id: ProjectId, updates: Partial<ProjectConfig>): Promise<void>;

  /** Archive a project */
  archive(id: ProjectId): Promise<void>;
}

export interface IArtifactStore {
  /** Store a versioned artifact */
  store(artifact: ArtifactData): Promise<ArtifactId>;

  /** Retrieve an artifact by ID */
  retrieve(id: ArtifactId): Promise<ArtifactData | null>;

  /** List artifacts for a project */
  list(projectId: ProjectId, filters?: ArtifactFilter): Promise<ArtifactMetadata[]>;

  /** Delete an artifact */
  delete(id: ArtifactId): Promise<boolean>;
}

export interface IScheduler {
  /** Register a scheduled task */
  register(schedule: ScheduleDefinition): Promise<string>;

  /** Cancel a scheduled task */
  cancel(scheduleId: string): Promise<boolean>;

  /** List active schedules for a project */
  list(projectId: ProjectId): Promise<ScheduleDefinition[]>;
}

export interface IEscalationService {
  /** Send an escalation to the Principal */
  notify(contract: EscalationContract): Promise<EscalationId>;

  /** Check if an escalation has been responded to */
  checkResponse(escalationId: EscalationId): Promise<EscalationResponse | null>;
}

export interface ISandbox {
  /** Execute code in an isolated sandbox */
  execute(code: SandboxPayload): Promise<SandboxResult>;

  /** Check if a capability is permitted */
  hasCapability(capability: string): boolean;
}

export interface IProjectApi {
  /** Memory API for the current project */
  memory: {
    read(query: string, scope: MemoryScope): Promise<MemoryEntry[]>;
    write(candidate: MemoryWriteCandidate): Promise<MemoryEntryId | null>;
    retrieve(situation: string, budget: number): Promise<RetrievalResult[]>;
  };

  /** Model API for the current project */
  model: {
    invoke(role: ModelRole, input: unknown): Promise<ModelResponse>;
    stream(role: ModelRole, input: unknown): AsyncIterable<ModelStreamChunk>;
  };

  /** Tool API for the current project */
  tool: {
    execute(name: string, params: unknown): Promise<ToolResult>;
    list(capabilities?: string[]): Promise<ToolDefinition[]>;
  };

  /** Artifact API for the current project */
  artifact: {
    store(data: ArtifactData): Promise<ArtifactId>;
    retrieve(id: ArtifactId): Promise<ArtifactData | null>;
    list(filters?: ArtifactFilter): Promise<ArtifactMetadata[]>;
  };

  /** Escalation API for the current project */
  escalation: {
    notify(channel: EscalationChannel, message: string): Promise<EscalationId>;
    request(decision: EscalationContract): Promise<EscalationResponse>;
  };

  /** Scheduler API for the current project */
  scheduler: {
    register(schedule: ScheduleDefinition): Promise<string>;
    cancel(id: string): Promise<boolean>;
  };

  /** Project API for the current project */
  project: {
    config(): ProjectConfig;
    state(): ProjectState;
    log(event: NousEvent): void;
  };
}

export interface IWitnessService {
  /** Append authorization evidence before a critical side effect */
  appendAuthorization(input: WitnessAuthorizationInput): Promise<WitnessEvent>;

  /** Append completion evidence after a critical side effect */
  appendCompletion(input: WitnessCompletionInput): Promise<WitnessEvent>;

  /** Append invariant finding evidence */
  appendInvariant(input: WitnessInvariantInput): Promise<WitnessEvent>;

  /** Create a signed checkpoint for the current ledger head */
  createCheckpoint(reason?: WitnessCheckpointReason): Promise<WitnessCheckpoint>;

  /** Rotate to a new active key epoch */
  rotateKeyEpoch(): Promise<number>;

  /** Verify ledger and checkpoint integrity for a range */
  verify(
    request?: WitnessVerificationRequest,
  ): Promise<VerificationReport>;

  /** Retrieve a previously generated verification report */
  getReport(id: VerificationReportId): Promise<VerificationReport | null>;

  /** List recent verification reports */
  listReports(limit?: number): Promise<VerificationReport[]>;

  /** Get the latest signed checkpoint */
  getLatestCheckpoint(): Promise<WitnessCheckpoint | null>;
}
