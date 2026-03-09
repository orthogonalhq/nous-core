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
  WorkflowDefinitionId,
  WorkflowDefinition,
  DerivedWorkflowGraph,
  WorkflowAdmissionRequest,
  WorkflowAdmissionResult,
  WorkflowStartResult,
  WorkflowTransitionInput,
  WorkflowNodeDefinitionId,
  WorkflowRunState,
  WorkflowExecuteNodeRequest,
  WorkflowContinueNodeRequest,
  WorkmodeId,
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
  PackageLifecycleTransitionRequest,
  PackageLifecycleTransitionResult,
  PackageLifecycleStateRecord,
  SkillAdmissionDecisionInput,
  SkillAdmissionDecisionRecord,
  SkillAdmissionRequest,
  SkillAdmissionResult,
  SkillAttributionThesisRequest,
  SkillAttributionThesisResult,
  SkillBenchEvaluationRequest,
  SkillBenchEvaluationResult,
  SkillContractValidationRequest,
  SkillContractValidationResult,
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

export interface WorkflowStartRequest {
  projectConfig: ProjectConfig;
  workflowDefinitionId?: WorkflowDefinitionId;
  workmodeId: WorkmodeId;
  sourceActor: import('./workmode.js').AuthorityActor;
  targetActor?: import('./workmode.js').AuthorityActor;
  controlState?: ProjectControlState;
  admissionEvidenceRefs?: string[];
  startedAt?: string;
}

export interface IWorkflowEngine {
  /** Resolve canonical workflow definition from project-scoped configuration */
  resolveDefinition(
    projectConfig: ProjectConfig,
    workflowDefinitionId?: WorkflowDefinitionId,
  ): Promise<WorkflowDefinition>;

  /** Derive deterministic executable graph from canonical definition */
  deriveGraph(definition: WorkflowDefinition): Promise<DerivedWorkflowGraph>;

  /** Evaluate fail-closed admission before run creation */
  evaluateAdmission(
    request: WorkflowAdmissionRequest,
  ): Promise<WorkflowAdmissionResult>;

  /** Start executing a workflow definition under the current workmode/control state */
  start(request: WorkflowStartRequest): Promise<WorkflowStartResult>;

  /** Resume a paused workflow */
  resume(
    executionId: WorkflowExecutionId,
    transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState>;

  /** Pause a running workflow */
  pause(
    executionId: WorkflowExecutionId,
    transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState>;

  /** Mark a ready/running node completed and advance deterministic traversal */
  completeNode(
    executionId: WorkflowExecutionId,
    nodeDefinitionId: WorkflowNodeDefinitionId,
    transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState>;

  /** Execute a ready node through the governed runtime and record canonical node/run state */
  executeReadyNode(request: WorkflowExecuteNodeRequest): Promise<WorkflowRunState>;

  /** Resolve a waiting node continuation (async, human, retry, checkpoint) */
  continueNode(request: WorkflowContinueNodeRequest): Promise<WorkflowRunState>;

  /** Get workflow execution state */
  getState(executionId: WorkflowExecutionId): Promise<WorkflowRunState | null>;
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
  /** Execute package runtime request through governed membrane sandbox. */
  execute(request: SandboxPayload): Promise<SandboxResult>;

  /** Check if a capability is permitted for the current sandbox profile. */
  hasCapability(capability: string, declaredCapabilities?: readonly string[]): boolean;
}

export interface IPackageLifecycleOrchestrator {
  /** Process package ingestion and create initial lifecycle state. */
  ingest(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Process package install transition with trust/compatibility/capability checks. */
  install(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Process package enable transition with runtime admission checks. */
  enable(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Stage package update while preserving previous safe version snapshot. */
  stageUpdate(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Commit staged update or return deterministic blocked/rollback decision. */
  commitUpdate(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Roll back staged update to previous safe version or disable when trust checks fail. */
  rollbackUpdate(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Export package with deterministic lifecycle evidence. */
  exportPackage(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Import package with explicit re-verification and re-approval gates. */
  importPackage(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Remove package after explicit retention decision governance checks. */
  removePackage(
    request: PackageLifecycleTransitionRequest,
  ): Promise<PackageLifecycleTransitionResult>;

  /** Retrieve canonical lifecycle state for project/package identity. */
  getState(
    projectId: ProjectId,
    packageId: string,
  ): Promise<PackageLifecycleStateRecord | null>;
}

export interface ISkillAdmissionOrchestrator {
  /** Validate canonical skill runtime contract artifacts. */
  validateSkillContract(
    input: SkillContractValidationRequest,
  ): Promise<SkillContractValidationResult>;

  /** Evaluate SkillBench evidence and fixed-model drift posture. */
  evaluateSkillBench(
    input: SkillBenchEvaluationRequest,
  ): Promise<SkillBenchEvaluationResult>;

  /** Evaluate attribution thesis completeness and recommendation posture. */
  evaluateAttributionThesis(
    input: SkillAttributionThesisRequest,
  ): Promise<SkillAttributionThesisResult>;

  /** Request admission/promotion from the orchestration lane. */
  requestAdmission(
    input: SkillAdmissionRequest,
  ): Promise<SkillAdmissionResult>;

  /** Record the final cortex decision for a pending admission. */
  recordCortexDecision(
    input: SkillAdmissionDecisionInput,
  ): Promise<SkillAdmissionResult>;

  /** Retrieve canonical admission decision state for a skill revision. */
  getDecision(
    skillId: string,
    revisionId: string,
  ): Promise<SkillAdmissionDecisionRecord | null>;
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
