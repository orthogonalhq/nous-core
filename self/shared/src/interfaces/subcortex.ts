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
  WorkflowRunTriggerContext,
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
  ArtifactDeleteRequest,
  ArtifactListFilter,
  ArtifactReadRequest,
  ArtifactReadResult,
  ArtifactVersionRecord,
  ArtifactWriteRequest,
  ArtifactWriteResult,
  ScheduleDefinition,
  ScheduleUpsertInput,
  EscalationContract,
  EscalationResponse,
  InAppEscalationRecord,
  AcknowledgeInAppEscalationInput,
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
  MaoAgentInspectInput,
  MaoAgentInspectProjection,
  MaoProjectControlRequest,
  MaoProjectControlResult,
  MaoProjectControlProjection,
  MaoProjectSnapshot,
  MaoProjectSnapshotInput,
  MaoEventType,
  MaoRunGraphSnapshot,
  GtmGateReportInput,
  GtmGateReport,
  GtmStageLabel,
  PackageLifecycleTransitionRequest,
  PackageLifecycleTransitionResult,
  PackageLifecycleStateRecord,
  PackageInstallRequest,
  PackageInstallResult,
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
  RegistryReleaseSubmissionInput,
  RegistryReleaseSubmissionResult,
  RegistryMetadataValidationInput,
  RegistryMetadataValidationResult,
  RegistryEligibilityRequest,
  RegistryInstallEligibilitySnapshot,
  RegistryGovernanceActionInput,
  RegistryGovernanceAction,
  MaintainerIdentity,
  RegistryAppealSubmissionInput,
  RegistryAppealResolutionInput,
  RegistryAppealRecord,
  RegistryBrowseRequest,
  RegistryBrowseResult,
  RegistryGovernanceTimelineRequest,
  RegistryGovernanceTimelineResult,
  RegistryAppealQuery,
  RegistryAppealQueryResult,
  NudgeSignalRecordInput,
  NudgeSignalRecord,
  NudgeCandidateGenerationInput,
  NudgeCandidateGenerationResult,
  NudgeRankingRequest,
  NudgeRankingResult,
  NudgeSuppressionCheckRequest,
  NudgeSuppressionCheckResult,
  NudgeDeliveryRecordInput,
  NudgeDeliveryRecord,
  NudgeFeedbackRecordInput,
  NudgeFeedbackRecord,
  NudgeAcceptanceRouteRequest,
  NudgeAcceptanceRouteResult,
  NudgeRankingPolicy,
  MarketplaceNudgeFeedRequest,
  MarketplaceNudgeFeedSnapshot,
  NudgeSuppressionMutationInput,
  NudgeSuppressionQuery,
  NudgeSuppressionQueryResult,
  ChannelIngressEnvelope,
  ChannelEgressEnvelope,
  CommunicationIdentityBindingUpsertInput,
  CommunicationIdentityBindingRecord,
  CommunicationApprovalIntakeRecord,
  CommunicationEscalationAcknowledgementInput,
  CommunicationIngressOutcome,
  CommunicationEgressOutcome,
  CommunicationRouteDecision,
  VoiceAssistantOutputInput,
  VoiceAssistantOutputStateRecord,
  VoiceBargeInInput,
  VoiceBargeInRecord,
  VoiceContinuationInput,
  VoiceContinuationRecord,
  VoiceSessionProjection,
  VoiceSessionProjectionInput,
  VoiceTurnDecisionRecord,
  VoiceTurnEvaluationInput,
  VoiceTurnStartInput,
  VoiceTurnStateRecord,
  EndpointTrustSurfaceSummary,
  PublicMcpAdmissionDecision,
  PublicMcpAgentCatalogEntry,
  PublicMcpAgentInvokeArguments,
  PublicMcpAgentInvokeResult,
  PublicMcpCompactArguments,
  PublicMcpDiscoveryBundle,
  PublicMcpDeleteArguments,
  PublicMcpDeploymentResolution,
  ExternalSourceCompactionResult,
  ExternalSourceMemoryEntry,
  ExternalSourceMutationResult,
  ExternalSourceSearchResult,
  PublicMcpExecutionRequest,
  PublicMcpExecutionResult,
  PublicMcpGetArguments,
  PublicMcpHttpRequest,
  PublicMcpPutArguments,
  PublicMcpSearchArguments,
  PublicMcpSystemInfo,
  PublicMcpSubject,
  PublicMcpTaskProjection,
  PublicMcpTaskResult,
  PublicMcpToolDefinition,
  PromoteExternalRecordCommand,
  DemotePromotedRecordCommand,
  PromotedMemoryGetQuery,
  PromotedMemoryRecord,
  PromotedMemorySearchQuery,
  PromotedMemorySearchResult,
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
  runId?: WorkflowExecutionId;
  workmodeId: WorkmodeId;
  sourceActor: import('./workmode.js').AuthorityActor;
  targetActor?: import('./workmode.js').AuthorityActor;
  controlState?: ProjectControlState;
  triggerContext?: WorkflowRunTriggerContext;
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

  /** List known in-process workflow runs for a project, newest first */
  listProjectRuns(projectId: ProjectId): Promise<WorkflowRunState[]>;

  /** Get the derived graph associated with a known in-process workflow run */
  getRunGraph(executionId: WorkflowExecutionId): Promise<DerivedWorkflowGraph | null>;
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
  store(request: ArtifactWriteRequest): Promise<ArtifactWriteResult>;

  /** Retrieve an artifact by project-scoped request */
  retrieve(request: ArtifactReadRequest): Promise<ArtifactReadResult | null>;

  /** List artifacts for a project */
  list(
    projectId: ProjectId,
    filters?: ArtifactListFilter,
  ): Promise<ArtifactVersionRecord[]>;

  /** Delete an artifact */
  delete(request: ArtifactDeleteRequest): Promise<boolean>;
}

export interface IScheduler {
  /** Register a scheduled task */
  register(schedule: ScheduleDefinition): Promise<string>;

  /** Create or update a schedule without delete/recreate churn */
  upsert(input: ScheduleUpsertInput): Promise<ScheduleDefinition>;

  /** Get a schedule by its canonical ID */
  get(scheduleId: string): Promise<ScheduleDefinition | null>;

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

  /** Get a canonical in-app escalation record */
  get(escalationId: EscalationId): Promise<InAppEscalationRecord | null>;

  /** List canonical in-app escalations for a project */
  listProjectQueue(projectId: ProjectId): Promise<InAppEscalationRecord[]>;

  /** Acknowledge a canonical in-app escalation from a supported surface */
  acknowledge(
    input: AcknowledgeInAppEscalationInput,
  ): Promise<InAppEscalationRecord | null>;
}

export interface IRegistryService {
  /** Submit a release into the registry intake pipeline. */
  submitRelease(
    input: RegistryReleaseSubmissionInput,
  ): Promise<RegistryReleaseSubmissionResult>;

  /** Retrieve a registry package by canonical package identity. */
  getPackage(packageId: string): Promise<import('../types/index.js').RegistryPackage | null>;

  /** Retrieve a registry release by canonical release identity. */
  getRelease(releaseId: string): Promise<import('../types/index.js').RegistryRelease | null>;

  /** List all known releases for a package, newest first. */
  listReleases(packageId: string): Promise<import('../types/index.js').RegistryRelease[]>;

  /** Validate signed metadata-chain state against pinned-root expectations. */
  validateMetadataChain(
    input: RegistryMetadataValidationInput,
  ): Promise<RegistryMetadataValidationResult>;

  /** Compute the canonical read-only eligibility snapshot for install/update gates. */
  evaluateInstallEligibility(
    input: RegistryEligibilityRequest,
  ): Promise<RegistryInstallEligibilitySnapshot>;

  /** Apply a governance or moderation action to canonical registry state. */
  applyGovernanceAction(
    input: RegistryGovernanceActionInput,
  ): Promise<RegistryGovernanceAction>;

  /** Retrieve a maintainer identity record. */
  getMaintainer(maintainerId: string): Promise<MaintainerIdentity | null>;

  /** Browse canonical registry package projections for marketplace surfaces. */
  listPackages(input: RegistryBrowseRequest): Promise<RegistryBrowseResult>;

  /** Resolve maintainers for a canonical registry package. */
  getPackageMaintainers(packageId: string): Promise<MaintainerIdentity[]>;

  /** List governance actions for a registry package/release/maintainer view. */
  listGovernanceActions(
    input: RegistryGovernanceTimelineRequest,
  ): Promise<RegistryGovernanceTimelineResult>;

  /** List appeals for a registry package or maintainer view. */
  listAppeals(input: RegistryAppealQuery): Promise<RegistryAppealQueryResult>;

  /** Submit a moderation or governance appeal. */
  submitAppeal(
    input: RegistryAppealSubmissionInput,
  ): Promise<RegistryAppealRecord>;

  /** Resolve a previously submitted appeal. */
  resolveAppeal(
    input: RegistryAppealResolutionInput,
  ): Promise<RegistryAppealRecord>;
}

export interface INudgeDiscoveryService {
  /** Record a canonical discovery signal with evidence linkage. */
  recordSignal(input: NudgeSignalRecordInput): Promise<NudgeSignalRecord>;

  /** Generate candidate envelopes from signal-linked seeds and registry/policy posture. */
  generateCandidates(
    input: NudgeCandidateGenerationInput,
  ): Promise<NudgeCandidateGenerationResult>;

  /** Rank candidates using a governed ranking policy and optional PFC evaluation. */
  rankCandidates(input: NudgeRankingRequest): Promise<NudgeRankingResult>;

  /** Evaluate cross-surface suppression state for a candidate and delivery surface. */
  evaluateSuppression(
    input: NudgeSuppressionCheckRequest,
  ): Promise<NudgeSuppressionCheckResult>;

  /** Persist a canonical delivery or delivery-block record. */
  recordDelivery(input: NudgeDeliveryRecordInput): Promise<NudgeDeliveryRecord>;

  /** Persist explicit user feedback that may inform future ranking state. */
  recordFeedback(input: NudgeFeedbackRecordInput): Promise<NudgeFeedbackRecord>;

  /** Route acceptance into advisory acknowledgement or runtime authorization seams. */
  routeAcceptance(
    input: NudgeAcceptanceRouteRequest,
  ): Promise<NudgeAcceptanceRouteResult>;

  /** Prepare a canonical marketplace/web/CLI surface feed from approved runtime truth. */
  prepareSurfaceFeed(
    input: MarketplaceNudgeFeedRequest,
  ): Promise<MarketplaceNudgeFeedSnapshot>;

  /** Persist a suppression mutation and its matching explicit feedback event. */
  applySuppression(
    input: NudgeSuppressionMutationInput,
  ): Promise<import('../types/index.js').NudgeSuppressionRecord>;

  /** List active or historical suppressions for a surface/query scope. */
  listSuppressions(
    input: NudgeSuppressionQuery,
  ): Promise<NudgeSuppressionQueryResult>;

  /** Retrieve the current or explicitly selected ranking policy. */
  getRankingPolicy(policyVersion?: string): Promise<NudgeRankingPolicy>;
}

export interface ICommunicationGatewayService {
  /** Receive normalized connector ingress and produce a canonical route or reject outcome. */
  receiveIngress(
    envelope: ChannelIngressEnvelope,
  ): Promise<CommunicationIngressOutcome>;

  /** Dispatch canonical egress over an approved bridge connector. */
  dispatchEgress(
    envelope: ChannelEgressEnvelope,
  ): Promise<CommunicationEgressOutcome>;

  /** Create or update a Principal-approved identity binding record. */
  upsertBinding(
    input: CommunicationIdentityBindingUpsertInput,
  ): Promise<CommunicationIdentityBindingRecord>;

  /** List pending or resolved approval-intake records, optionally filtered to a project scope. */
  listApprovalIntake(
    projectId?: ProjectId,
  ): Promise<CommunicationApprovalIntakeRecord[]>;

  /** Bridge a communication acknowledgement into the canonical escalation service. */
  acknowledgeEscalation(
    input: CommunicationEscalationAcknowledgementInput,
  ): Promise<InAppEscalationRecord | null>;

  /** Retrieve a previously created canonical route decision. */
  getRouteDecision(routeId: string): Promise<CommunicationRouteDecision | null>;
}

export interface IPublicMcpGatewayService {
  /** Build the public OAuth discovery documents for the MCP edge. */
  getDiscoveryDocuments(): Promise<PublicMcpDiscoveryBundle>;

  /** Evaluate bearer, audience, origin, scope, namespace, and schema posture. */
  authorize(request: PublicMcpHttpRequest): Promise<PublicMcpAdmissionDecision>;

  /** List the tools visible to an already authorized external client subject. */
  listVisibleTools(subject: PublicMcpSubject): Promise<PublicMcpToolDefinition[]>;

  /** Execute an authorized public MCP request over the canonical bridge surface. */
  execute(request: PublicMcpExecutionRequest): Promise<PublicMcpExecutionResult>;
}

export interface IPublicMcpDeploymentRouterService {
  /** Resolve the active backend mode and deployment binding for a public MCP request. */
  resolve(request: PublicMcpExecutionRequest): Promise<PublicMcpDeploymentResolution>;
}

export interface PublicMcpAgentListQuery {
  requestId: string;
  subject: PublicMcpSubject;
  requestedAt: string;
}

export interface PublicMcpAgentInvokeCommand extends PublicMcpAgentListQuery {
  arguments: PublicMcpAgentInvokeArguments;
}

export interface PublicMcpTaskQuery extends PublicMcpAgentListQuery {
  taskId: string;
}

export interface PublicMcpSystemInfoQuery extends PublicMcpAgentListQuery {}

export interface IPublicMcpSurfaceService {
  /** List externally visible public agents for the authenticated subject. */
  listAgents(request: PublicMcpAgentListQuery): Promise<PublicMcpAgentCatalogEntry[]>;

  /** Invoke a public agent through the canonical public runtime. */
  invokeAgent(request: PublicMcpAgentInvokeCommand): Promise<PublicMcpAgentInvokeResult>;

  /** Retrieve the current subject-scoped task projection. */
  getTask(request: PublicMcpTaskQuery): Promise<PublicMcpTaskProjection | null>;

  /** Retrieve the terminal result for a subject-scoped task. */
  getTaskResult(request: PublicMcpTaskQuery): Promise<PublicMcpTaskResult | null>;

  /** Project public-safe server and task-support metadata. */
  getSystemInfo(request: PublicMcpSystemInfoQuery): Promise<PublicMcpSystemInfo>;
}

export interface ExternalSourceCommandContext {
  requestId: string;
  subject: PublicMcpSubject;
  requestedAt: string;
  idempotencyKey?: string;
}

export interface ExternalSourcePutCommand extends ExternalSourceCommandContext {
  arguments: PublicMcpPutArguments;
}

export interface ExternalSourceGetQuery extends ExternalSourceCommandContext {
  arguments: PublicMcpGetArguments;
}

export interface ExternalSourceSearchQuery extends ExternalSourceCommandContext {
  arguments: PublicMcpSearchArguments;
}

export interface ExternalSourceDeleteCommand extends ExternalSourceCommandContext {
  arguments: PublicMcpDeleteArguments;
}

export interface ExternalSourceCompactCommand extends ExternalSourceCommandContext {
  arguments: PublicMcpCompactArguments;
}

export interface IExternalSourceMemoryService {
  /** Execute a source-local append or supersede write. */
  put(request: ExternalSourcePutCommand): Promise<ExternalSourceMutationResult>;

  /** Read one source-local external-memory entry. */
  get(request: ExternalSourceGetQuery): Promise<ExternalSourceMemoryEntry | null>;

  /** Search source-local external-memory entries using canonical public-memory semantics. */
  search(request: ExternalSourceSearchQuery): Promise<ExternalSourceSearchResult>;

  /** Soft-delete one source-local external-memory entry. */
  delete(request: ExternalSourceDeleteCommand): Promise<ExternalSourceMutationResult>;

  /** Compact source-local external STM into allowed public compaction outputs. */
  compact(request: ExternalSourceCompactCommand): Promise<ExternalSourceCompactionResult>;
}

export interface IPromotedMemoryBridgeService {
  /** Promote one external source record into the internal promoted tier. */
  promote(command: PromoteExternalRecordCommand): Promise<PromotedMemoryRecord>;

  /** Soft-delete one promoted-tier record while preserving audit lineage. */
  demote(command: DemotePromotedRecordCommand): Promise<PromotedMemoryRecord>;

  /** Read one promoted-tier record by promoted ID. */
  get(query: PromotedMemoryGetQuery): Promise<PromotedMemoryRecord | null>;

  /** Search promoted-tier records without querying external source tables live. */
  search(query: PromotedMemorySearchQuery): Promise<PromotedMemorySearchResult>;
}

export interface IEndpointTrustService {
  /** Create or refresh a manual pairing request for a peripheral identity. */
  requestPairing(
    input: import('../types/index.js').EndpointPairingRequestInput,
  ): Promise<import('../types/index.js').EndpointPairingRecord>;

  /** Apply the principal-approved outcome of a pairing review. */
  reviewPairing(
    input: import('../types/index.js').EndpointPairingReviewInput,
  ): Promise<import('../types/index.js').EndpointPairingRecord>;

  /** Register a concrete endpoint under a paired peripheral with immutable direction. */
  registerEndpoint(
    input: import('../types/index.js').EndpointRegistrationInput,
  ): Promise<import('../types/index.js').EndpointTrustEndpoint>;

  /** Grant a specific sensory or action capability to a trusted endpoint. */
  grantCapability(
    input: import('../types/index.js').EndpointCapabilityGrantInput,
  ): Promise<import('../types/index.js').EndpointCapabilityGrantRecord>;

  /** Revoke a previously granted endpoint capability. */
  revokeCapability(
    input: import('../types/index.js').EndpointCapabilityRevocationInput,
  ): Promise<import('../types/index.js').EndpointCapabilityGrantRecord>;

  /** Establish a transport session for a trusted endpoint. */
  establishSession(
    input: import('../types/index.js').EndpointSessionStartInput,
  ): Promise<import('../types/index.js').EndpointSessionRecord>;

  /** Rotate an active endpoint transport session. */
  rotateSession(
    input: import('../types/index.js').EndpointSessionRotateInput,
  ): Promise<import('../types/index.js').EndpointSessionRecord>;

  /** Validate a signed endpoint transport envelope against current session state. */
  validateTransport(
    input: import('../types/index.js').EndpointTransportValidationRequest,
  ): Promise<import('../types/index.js').EndpointTransportValidationResult>;

  /** Evaluate capability access against trust, direction, grant, and confirmation posture. */
  authorize(
    input: import('../types/index.js').EndpointAuthorizationRequest,
  ): Promise<import('../types/index.js').EndpointAuthorizationResult>;

  /** Record an endpoint trust incident and apply deterministic containment. */
  reportIncident(
    input: import('../types/index.js').EndpointIncidentReportInput,
  ): Promise<import('../types/index.js').EndpointIncidentRecord>;

  /** Retrieve the current peripheral trust record. */
  getPeripheral(
    peripheralId: string,
  ): Promise<import('../types/index.js').EndpointTrustPeripheral | null>;

  /** Retrieve the current endpoint trust record. */
  getEndpoint(
    endpointId: string,
  ): Promise<import('../types/index.js').EndpointTrustEndpoint | null>;

  /** Build a project-scoped trust summary for projection surfaces. */
  getProjectSurfaceSummary(
    projectId: ProjectId,
  ): Promise<EndpointTrustSurfaceSummary>;
}

export interface IVoiceControlService {
  /** Create a canonical voice turn record for a session. */
  beginTurn(input: VoiceTurnStartInput): Promise<VoiceTurnStateRecord>;

  /** Evaluate combined end-of-turn signals, confidence, confirmation, and control posture. */
  evaluateTurn(input: VoiceTurnEvaluationInput): Promise<VoiceTurnDecisionRecord>;

  /** Track assistant output state for barge-in and continuation safety. */
  registerAssistantOutput(
    input: VoiceAssistantOutputInput,
  ): Promise<VoiceAssistantOutputStateRecord>;

  /** Record user interruption and transition the session into continuation posture. */
  handleBargeIn(input: VoiceBargeInInput): Promise<VoiceBargeInRecord>;

  /** Resolve an interrupted assistant output or text-first fallback continuation. */
  resolveContinuation(
    input: VoiceContinuationInput,
  ): Promise<VoiceContinuationRecord>;

  /** Read the canonical voice session projection for downstream consumers. */
  getSessionProjection(
    input: VoiceSessionProjectionInput,
  ): Promise<VoiceSessionProjection>;
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

export interface IPackageInstallService {
  /** Resolve, authorize, materialize, and record one package install or update. */
  installPackage(request: PackageInstallRequest): Promise<PackageInstallResult>;
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
    store(data: Omit<ArtifactWriteRequest, 'projectId'>): Promise<ArtifactWriteResult>;
    retrieve(
      request: Omit<ArtifactReadRequest, 'projectId'>,
    ): Promise<ArtifactReadResult | null>;
    list(filters?: ArtifactListFilter): Promise<ArtifactVersionRecord[]>;
    delete(request: Omit<ArtifactDeleteRequest, 'projectId'>): Promise<boolean>;
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

  /** Derive the full MAO operating-surface snapshot for a project. */
  getProjectSnapshot(
    input: MaoProjectSnapshotInput,
  ): Promise<MaoProjectSnapshot>;

  /** Derive inspect data for a selected MAO agent projection. */
  getAgentInspectProjection(
    input: MaoAgentInspectInput,
  ): Promise<MaoAgentInspectProjection | null>;

  /** Derive the canonical run-graph snapshot used by MAO graph views. */
  getRunGraphSnapshot(
    input: MaoProjectSnapshotInput,
  ): Promise<MaoRunGraphSnapshot>;

  /** Submit a project-scope control request from the MAO surface. */
  requestProjectControl(
    input: MaoProjectControlRequest,
    confirmationProof?: ConfirmationProof,
  ): Promise<MaoProjectControlResult>;

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
