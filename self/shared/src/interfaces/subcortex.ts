/**
 * Subcortex layer interface contracts.
 *
 * IModelRouter, IModelProvider, IToolExecutor, IWorkflowEngine,
 * IProjectStore, IArtifactStore, IScheduler, IEscalationService, ISandbox.
 */
import type {
  ProjectId,
  ProviderId,
  ArtifactId,
  WorkflowExecutionId,
  EscalationId,
  ModelRole,
  ModelProviderConfig,
  ModelRequest,
  ModelResponse,
  ModelStreamChunk,
  ToolResult,
  ToolDefinition,
  WorkflowGraph,
  WorkflowState,
  ProjectConfig,
  ArtifactData,
  ArtifactMetadata,
  ArtifactFilter,
  ScheduleDefinition,
  EscalationContract,
  EscalationResponse,
  SandboxPayload,
  SandboxResult,
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
  ControlCommandEnvelope,
  ConfirmationProof,
  ConfirmationProofRequest,
  OpctlSubmitResult,
  ScopeSnapshot,
  ControlScope,
  ControlActorType,
  ProjectControlState,
  MaoAgentProjection,
  MaoProjectControlProjection,
  MaoEventType,
  GtmGateReportInput,
  GtmGateReport,
  GtmStageLabel,
} from '../types/index.js';
import type { IProjectApi } from './project-api.js';

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

export type { IProjectApi };

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

export interface IOpctlService {
  /** Submit a control command; returns apply result or rejection with reason. */
  submitCommand(
    envelope: ControlCommandEnvelope,
    confirmationProof?: ConfirmationProof,
  ): Promise<OpctlSubmitResult>;

  /** Request a confirmation proof for T1/T2/T3 commands (runtime-issued, short-lived). */
  requestConfirmationProof(
    params: ConfirmationProofRequest,
  ): Promise<ConfirmationProof>;

  /** Validate confirmation proof (scope-bound, action-bound, not expired). */
  validateConfirmationProof(
    proof: ConfirmationProof,
    envelope: ControlCommandEnvelope,
  ): Promise<boolean>;

  /** Resolve scope to target snapshot; used internally by submitCommand. */
  resolveScope(scope: ControlScope): Promise<ScopeSnapshot>;

  /** Check if project has start_lock (hard_stopped). */
  hasStartLock(projectId: ProjectId): Promise<boolean>;

  /** Set/release start lock (Principal-only for release). */
  setStartLock(
    projectId: ProjectId,
    locked: boolean,
    actor: ControlActorType,
  ): Promise<void>;

  /** Get project control state (running | paused_review | hard_stopped | resuming). Phase 2.6. */
  getProjectControlState(projectId: ProjectId): Promise<ProjectControlState>;
}

export interface IMaoProjectionService {
  /** Derive agent projections for a project from canonical event/state truth. */
  getAgentProjections(projectId: ProjectId): Promise<MaoAgentProjection[]>;

  /** Derive project control projection for a project. */
  getProjectControlProjection(
    projectId: ProjectId,
  ): Promise<MaoProjectControlProjection | null>;

  /** Emit MAO projection event (witness-linked). */
  emitProjectionEvent(
    eventType: MaoEventType,
    detail: Record<string, unknown>,
  ): Promise<void>;
}

export interface IGtmGateCalculator {
  /** Compute GTM gate report from verification report, pillar status, benchmark results. */
  computeGateReport(input: GtmGateReportInput): Promise<GtmGateReport>;

  /** Check if promotion is blocked (open S0 or threshold failure). */
  isPromotionBlocked(
    report: GtmGateReport,
    targetStage: GtmStageLabel,
  ): boolean;
}
