/**
 * Stub implementations for deferred subcortex interfaces.
 *
 * Most methods throw NousError with code 'NOT_IMPLEMENTED'.
 * Real implementations arrive in Phase 5 (workflows, artifacts, scheduler, escalation)
 * and Phase 7 (ProjectApi).
 *
 * Phase 7.3 provides a governed baseline for StubSandbox by routing execute()
 * through @nous/subcortex-sandbox RuntimeMembrane.
 *
 * Phase 3.3: StubProjectApi accepts optional policy enforcement deps. When provided,
 * memory.read/write/retrieve evaluate policy before throwing. Cross-project/global
 * operations that would be denied return [] or null; allowed operations still throw
 * NOT_IMPLEMENTED. Enforcement boundary documented in Phase 3.3 SDS.
 */
import { NousError } from '@nous/shared';
import {
  InMemoryGrantReplayStore,
  RuntimeMembrane,
  type GrantReplayStore,
} from '@nous/subcortex-sandbox';
import {
  isCrossProjectMemoryWrite,
  buildPolicyAccessContextForMemoryWrite,
} from '@nous/memory-access';
import { DEFAULT_MEMORY_ACCESS_POLICY } from '@nous/shared';
import type {
  IMemoryAccessPolicyEngine,
  IProjectStore,
  ProjectControlState,
} from '@nous/shared';
import type {
  IWorkflowEngine,
  WorkflowStartRequest,
  IArtifactStore,
  IScheduler,
  IEscalationService,
  ICommunicationGatewayService,
  IRegistryService,
  ISandbox,
  IProjectApi,
  ProjectId,
  WorkflowExecutionId,
  WorkflowDefinition,
  DerivedWorkflowGraph,
  WorkflowAdmissionRequest,
  WorkflowAdmissionResult,
  WorkflowStartResult,
  WorkflowTransitionInput,
  WorkflowNodeDefinitionId,
  WorkflowRunState,
  ArtifactDeleteRequest,
  ArtifactListFilter,
  ArtifactReadRequest,
  ArtifactReadResult,
  ArtifactVersionRecord,
  ArtifactWriteRequest,
  ArtifactWriteResult,
  ScheduleDefinition,
  ScheduleUpsertInput,
  EscalationId,
  EscalationContract,
  EscalationResponse,
  InAppEscalationRecord,
  AcknowledgeInAppEscalationInput,
  RegistryReleaseSubmissionInput,
  RegistryReleaseSubmissionResult,
  RegistryMetadataValidationInput,
  RegistryMetadataValidationResult,
  RegistryEligibilityRequest,
  RegistryInstallEligibilitySnapshot,
  RegistryGovernanceActionInput,
  RegistryGovernanceAction,
  MaintainerIdentity,
  RegistryBrowseRequest,
  RegistryBrowseResult,
  RegistryGovernanceTimelineRequest,
  RegistryGovernanceTimelineResult,
  RegistryAppealQuery,
  RegistryAppealQueryResult,
  RegistryAppealSubmissionInput,
  RegistryAppealResolutionInput,
  RegistryAppealRecord,
  INudgeDiscoveryService,
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
  SandboxPayload,
  SandboxResult,
  MemoryScope,
  ModelRole,
  EscalationChannel,
  ProjectConfig,
  ProjectState,
  MemoryEntry,
  MemoryWriteCandidate,
  MemoryEntryId,
  RetrievalResult,
  ModelResponse,
  ModelStreamChunk,
  ToolResult,
  ToolDefinition,
  NousEvent,
} from '@nous/shared';

const stubNotImpl = (
  interfaceName: string,
  method: string,
  targetPhase: string,
): never => {
  console.warn(`[nous:stub] ${interfaceName}.${method} called — not implemented`);
  throw new NousError(
    `${interfaceName}.${method}() is not implemented — real implementation in ${targetPhase}`,
    'NOT_IMPLEMENTED',
  );
};

export class StubWorkflowEngine implements IWorkflowEngine {
  async resolveDefinition(
    _projectConfig: ProjectConfig,
    _workflowDefinitionId?: import('@nous/shared').WorkflowDefinitionId,
  ): Promise<WorkflowDefinition> {
    return stubNotImpl('IWorkflowEngine', 'resolveDefinition', 'Phase 9.1');
  }

  async deriveGraph(
    _definition: WorkflowDefinition,
  ): Promise<DerivedWorkflowGraph> {
    return stubNotImpl('IWorkflowEngine', 'deriveGraph', 'Phase 9.1');
  }

  async evaluateAdmission(
    _request: WorkflowAdmissionRequest,
  ): Promise<WorkflowAdmissionResult> {
    return stubNotImpl('IWorkflowEngine', 'evaluateAdmission', 'Phase 9.1');
  }

  async start(_request: WorkflowStartRequest): Promise<WorkflowStartResult> {
    return stubNotImpl('IWorkflowEngine', 'start', 'Phase 9.1');
  }

  async resume(
    _executionId: WorkflowExecutionId,
    _transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState> {
    return stubNotImpl('IWorkflowEngine', 'resume', 'Phase 9.1');
  }

  async pause(
    _executionId: WorkflowExecutionId,
    _transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState> {
    return stubNotImpl('IWorkflowEngine', 'pause', 'Phase 9.1');
  }

  async completeNode(
    _executionId: WorkflowExecutionId,
    _nodeDefinitionId: WorkflowNodeDefinitionId,
    _transition: WorkflowTransitionInput,
  ): Promise<WorkflowRunState> {
    return stubNotImpl('IWorkflowEngine', 'completeNode', 'Phase 9.1');
  }

  async executeReadyNode(
    _request: import('@nous/shared').WorkflowExecuteNodeRequest,
  ): Promise<WorkflowRunState> {
    return stubNotImpl('IWorkflowEngine', 'executeReadyNode', 'Phase 9.2');
  }

  async continueNode(
    _request: import('@nous/shared').WorkflowContinueNodeRequest,
  ): Promise<WorkflowRunState> {
    return stubNotImpl('IWorkflowEngine', 'continueNode', 'Phase 9.2');
  }

  async getState(
    _executionId: WorkflowExecutionId,
  ): Promise<WorkflowRunState | null> {
    return stubNotImpl('IWorkflowEngine', 'getState', 'Phase 5');
  }

  async listProjectRuns(
    _projectId: ProjectId,
  ): Promise<WorkflowRunState[]> {
    return stubNotImpl('IWorkflowEngine', 'listProjectRuns', 'Phase 9.7');
  }

  async getRunGraph(
    _executionId: WorkflowExecutionId,
  ): Promise<DerivedWorkflowGraph | null> {
    return stubNotImpl('IWorkflowEngine', 'getRunGraph', 'Phase 9.7');
  }
}

export class StubArtifactStore implements IArtifactStore {
  async store(_artifact: ArtifactWriteRequest): Promise<ArtifactWriteResult> {
    return stubNotImpl('IArtifactStore', 'store', 'Phase 5');
  }

  async retrieve(_request: ArtifactReadRequest): Promise<ArtifactReadResult | null> {
    return stubNotImpl('IArtifactStore', 'retrieve', 'Phase 5');
  }

  async list(
    _projectId: ProjectId,
    _filters?: ArtifactListFilter,
  ): Promise<ArtifactVersionRecord[]> {
    return stubNotImpl('IArtifactStore', 'list', 'Phase 5');
  }

  async delete(_request: ArtifactDeleteRequest): Promise<boolean> {
    return stubNotImpl('IArtifactStore', 'delete', 'Phase 5');
  }
}

export class StubScheduler implements IScheduler {
  async register(_schedule: ScheduleDefinition): Promise<string> {
    return stubNotImpl('IScheduler', 'register', 'Phase 5');
  }

  async upsert(_input: ScheduleUpsertInput): Promise<ScheduleDefinition> {
    return stubNotImpl('IScheduler', 'upsert', 'Phase 9.6');
  }

  async get(_scheduleId: string): Promise<ScheduleDefinition | null> {
    return stubNotImpl('IScheduler', 'get', 'Phase 9.6');
  }

  async cancel(_scheduleId: string): Promise<boolean> {
    return stubNotImpl('IScheduler', 'cancel', 'Phase 5');
  }

  async list(_projectId: ProjectId): Promise<ScheduleDefinition[]> {
    return stubNotImpl('IScheduler', 'list', 'Phase 5');
  }
}

export class StubEscalationService implements IEscalationService {
  async notify(_contract: EscalationContract): Promise<EscalationId> {
    return stubNotImpl('IEscalationService', 'notify', 'Phase 5');
  }

  async checkResponse(
    _escalationId: EscalationId,
  ): Promise<EscalationResponse | null> {
    return stubNotImpl('IEscalationService', 'checkResponse', 'Phase 5');
  }

  async get(
    _escalationId: EscalationId,
  ): Promise<InAppEscalationRecord | null> {
    return stubNotImpl('IEscalationService', 'get', 'Phase 9.6');
  }

  async listProjectQueue(
    _projectId: ProjectId,
  ): Promise<InAppEscalationRecord[]> {
    return stubNotImpl('IEscalationService', 'listProjectQueue', 'Phase 9.6');
  }

  async acknowledge(
    _input: AcknowledgeInAppEscalationInput,
  ): Promise<InAppEscalationRecord | null> {
    return stubNotImpl('IEscalationService', 'acknowledge', 'Phase 9.6');
  }
}

export class StubRegistryService implements IRegistryService {
  async submitRelease(
    _input: RegistryReleaseSubmissionInput,
  ): Promise<RegistryReleaseSubmissionResult> {
    return stubNotImpl('IRegistryService', 'submitRelease', 'Phase 10.1');
  }

  async getPackage(
    _packageId: string,
  ): Promise<import('@nous/shared').RegistryPackage | null> {
    return stubNotImpl('IRegistryService', 'getPackage', 'Phase 10.1');
  }

  async getRelease(
    _releaseId: string,
  ): Promise<import('@nous/shared').RegistryRelease | null> {
    return stubNotImpl('IRegistryService', 'getRelease', 'Phase 10.1');
  }

  async listReleases(
    _packageId: string,
  ): Promise<import('@nous/shared').RegistryRelease[]> {
    return stubNotImpl('IRegistryService', 'listReleases', 'Phase 10.1');
  }

  async validateMetadataChain(
    _input: RegistryMetadataValidationInput,
  ): Promise<RegistryMetadataValidationResult> {
    return stubNotImpl('IRegistryService', 'validateMetadataChain', 'Phase 10.1');
  }

  async evaluateInstallEligibility(
    _input: RegistryEligibilityRequest,
  ): Promise<RegistryInstallEligibilitySnapshot> {
    return stubNotImpl(
      'IRegistryService',
      'evaluateInstallEligibility',
      'Phase 10.1',
    );
  }

  async applyGovernanceAction(
    _input: RegistryGovernanceActionInput,
  ): Promise<RegistryGovernanceAction> {
    return stubNotImpl('IRegistryService', 'applyGovernanceAction', 'Phase 10.1');
  }

  async getMaintainer(
    _maintainerId: string,
  ): Promise<MaintainerIdentity | null> {
    return stubNotImpl('IRegistryService', 'getMaintainer', 'Phase 10.1');
  }

  async listPackages(
    _input: RegistryBrowseRequest,
  ): Promise<RegistryBrowseResult> {
    return stubNotImpl('IRegistryService', 'listPackages', 'Phase 10.3');
  }

  async getPackageMaintainers(
    _packageId: string,
  ): Promise<MaintainerIdentity[]> {
    return stubNotImpl('IRegistryService', 'getPackageMaintainers', 'Phase 10.3');
  }

  async listGovernanceActions(
    _input: RegistryGovernanceTimelineRequest,
  ): Promise<RegistryGovernanceTimelineResult> {
    return stubNotImpl('IRegistryService', 'listGovernanceActions', 'Phase 10.3');
  }

  async listAppeals(
    _input: RegistryAppealQuery,
  ): Promise<RegistryAppealQueryResult> {
    return stubNotImpl('IRegistryService', 'listAppeals', 'Phase 10.3');
  }

  async submitAppeal(
    _input: RegistryAppealSubmissionInput,
  ): Promise<RegistryAppealRecord> {
    return stubNotImpl('IRegistryService', 'submitAppeal', 'Phase 10.1');
  }

  async resolveAppeal(
    _input: RegistryAppealResolutionInput,
  ): Promise<RegistryAppealRecord> {
    return stubNotImpl('IRegistryService', 'resolveAppeal', 'Phase 10.1');
  }
}

export class StubNudgeDiscoveryService implements INudgeDiscoveryService {
  async recordSignal(
    _input: NudgeSignalRecordInput,
  ): Promise<NudgeSignalRecord> {
    return stubNotImpl('INudgeDiscoveryService', 'recordSignal', 'Phase 10.2');
  }

  async generateCandidates(
    _input: NudgeCandidateGenerationInput,
  ): Promise<NudgeCandidateGenerationResult> {
    return stubNotImpl(
      'INudgeDiscoveryService',
      'generateCandidates',
      'Phase 10.2',
    );
  }

  async rankCandidates(
    _input: NudgeRankingRequest,
  ): Promise<NudgeRankingResult> {
    return stubNotImpl('INudgeDiscoveryService', 'rankCandidates', 'Phase 10.2');
  }

  async evaluateSuppression(
    _input: NudgeSuppressionCheckRequest,
  ): Promise<NudgeSuppressionCheckResult> {
    return stubNotImpl(
      'INudgeDiscoveryService',
      'evaluateSuppression',
      'Phase 10.2',
    );
  }

  async recordDelivery(
    _input: NudgeDeliveryRecordInput,
  ): Promise<NudgeDeliveryRecord> {
    return stubNotImpl('INudgeDiscoveryService', 'recordDelivery', 'Phase 10.2');
  }

  async recordFeedback(
    _input: NudgeFeedbackRecordInput,
  ): Promise<NudgeFeedbackRecord> {
    return stubNotImpl('INudgeDiscoveryService', 'recordFeedback', 'Phase 10.2');
  }

  async routeAcceptance(
    _input: NudgeAcceptanceRouteRequest,
  ): Promise<NudgeAcceptanceRouteResult> {
    return stubNotImpl('INudgeDiscoveryService', 'routeAcceptance', 'Phase 10.2');
  }

  async prepareSurfaceFeed(
    _input: MarketplaceNudgeFeedRequest,
  ): Promise<MarketplaceNudgeFeedSnapshot> {
    return stubNotImpl('INudgeDiscoveryService', 'prepareSurfaceFeed', 'Phase 10.3');
  }

  async applySuppression(
    _input: NudgeSuppressionMutationInput,
  ): Promise<import('@nous/shared').NudgeSuppressionRecord> {
    return stubNotImpl('INudgeDiscoveryService', 'applySuppression', 'Phase 10.3');
  }

  async listSuppressions(
    _input: NudgeSuppressionQuery,
  ): Promise<NudgeSuppressionQueryResult> {
    return stubNotImpl('INudgeDiscoveryService', 'listSuppressions', 'Phase 10.3');
  }

  async getRankingPolicy(_policyVersion?: string): Promise<NudgeRankingPolicy> {
    return stubNotImpl('INudgeDiscoveryService', 'getRankingPolicy', 'Phase 10.2');
  }
}

export class StubCommunicationGatewayService implements ICommunicationGatewayService {
  async receiveIngress(
    _envelope: ChannelIngressEnvelope,
  ): Promise<CommunicationIngressOutcome> {
    return stubNotImpl(
      'ICommunicationGatewayService',
      'receiveIngress',
      'Phase 11.1',
    );
  }

  async dispatchEgress(
    _envelope: ChannelEgressEnvelope,
  ): Promise<CommunicationEgressOutcome> {
    return stubNotImpl(
      'ICommunicationGatewayService',
      'dispatchEgress',
      'Phase 11.1',
    );
  }

  async upsertBinding(
    _input: CommunicationIdentityBindingUpsertInput,
  ): Promise<CommunicationIdentityBindingRecord> {
    return stubNotImpl(
      'ICommunicationGatewayService',
      'upsertBinding',
      'Phase 11.1',
    );
  }

  async listApprovalIntake(
    _projectId?: ProjectId,
  ): Promise<CommunicationApprovalIntakeRecord[]> {
    return stubNotImpl(
      'ICommunicationGatewayService',
      'listApprovalIntake',
      'Phase 11.1',
    );
  }

  async acknowledgeEscalation(
    _input: CommunicationEscalationAcknowledgementInput,
  ): Promise<InAppEscalationRecord | null> {
    return stubNotImpl(
      'ICommunicationGatewayService',
      'acknowledgeEscalation',
      'Phase 11.1',
    );
  }

  async getRouteDecision(
    _routeId: string,
  ): Promise<CommunicationRouteDecision | null> {
    return stubNotImpl(
      'ICommunicationGatewayService',
      'getRouteDecision',
      'Phase 11.1',
    );
  }
}

export interface StubSandboxOptions {
  allowedCapabilities?: readonly string[];
  replayStore?: GrantReplayStore;
  now?: () => Date;
}

export class StubSandbox implements ISandbox {
  private readonly membrane: RuntimeMembrane;
  private readonly allowedCapabilities: Set<string>;

  constructor(options: StubSandboxOptions = {}) {
    this.allowedCapabilities = new Set(options.allowedCapabilities ?? []);
    this.membrane = new RuntimeMembrane({
      replayStore: options.replayStore ?? new InMemoryGrantReplayStore(),
      now: options.now,
    });
  }

  async execute(code: SandboxPayload): Promise<SandboxResult> {
    return this.membrane.execute(code);
  }

  hasCapability(capability: string, declaredCapabilities?: readonly string[]): boolean {
    const declaredAllowed = declaredCapabilities
      ? declaredCapabilities.includes(capability)
      : false;
    if (this.allowedCapabilities.size === 0) {
      return declaredAllowed;
    }
    if (!this.allowedCapabilities.has(capability)) {
      return false;
    }
    return declaredCapabilities ? declaredAllowed : true;
  }
}

/** Optional policy enforcement deps for StubProjectApi. When provided, memory ops run policy gate before throwing. */
export interface StubProjectApiPolicyDeps {
  projectId: ProjectId;
  policyEngine: IMemoryAccessPolicyEngine;
  projectStore: IProjectStore;
  getProjectControlState?: (projectId: ProjectId) => Promise<ProjectControlState | undefined>;
}

export class StubProjectApi implements IProjectApi {
  constructor(private readonly policyDeps?: StubProjectApiPolicyDeps) {}

  memory = {
    read: async (
      _query: string,
      scope: MemoryScope,
    ): Promise<MemoryEntry[]> => {
      const deps = this.policyDeps;
      if (deps && scope === 'global') {
        const config = await deps.projectStore.get(deps.projectId);
        const policy = config?.memoryAccessPolicy ?? DEFAULT_MEMORY_ACCESS_POLICY;
        const controlState = deps.getProjectControlState
          ? await deps.getProjectControlState(deps.projectId)
          : undefined;
        const ctx = {
          action: 'retrieve' as const,
          fromProjectId: deps.projectId,
          includeGlobal: true,
          projectPolicy: policy,
          targetProjectIds: [] as ProjectId[],
          targetProjectPolicies: {} as Record<string, typeof policy>,
          projectControlState: controlState,
        };
        const result = deps.policyEngine.evaluate(ctx);
        if (!result.allowed) return [];
      }
      return stubNotImpl('IProjectApi.memory', 'read', 'Phase 7');
    },
    write: async (
      candidate: MemoryWriteCandidate,
    ): Promise<MemoryEntryId | null> => {
      const deps = this.policyDeps;
      if (deps && isCrossProjectMemoryWrite(candidate, deps.projectId)) {
        const actingConfig = await deps.projectStore.get(deps.projectId);
        const targetConfig =
          candidate.projectId != null && candidate.projectId !== deps.projectId
            ? await deps.projectStore.get(candidate.projectId)
            : undefined;
        const controlState = deps.getProjectControlState
          ? await deps.getProjectControlState(deps.projectId)
          : undefined;
        const policyCtx = buildPolicyAccessContextForMemoryWrite({
          candidate,
          actingProjectId: deps.projectId,
          actingProjectConfig: actingConfig,
          targetProjectConfig: targetConfig ?? null,
          projectControlState: controlState,
        });
        if (policyCtx != null) {
          const result = deps.policyEngine.evaluate(policyCtx);
          if (!result.allowed) return null;
        }
      }
      return stubNotImpl('IProjectApi.memory', 'write', 'Phase 7');
    },
    retrieve: async (
      _situation: string,
      _budget: number,
    ): Promise<RetrievalResult[]> => {
      const deps = this.policyDeps;
      if (deps) {
        const config = await deps.projectStore.get(deps.projectId);
        const policy = config?.memoryAccessPolicy ?? DEFAULT_MEMORY_ACCESS_POLICY;
        const controlState = deps.getProjectControlState
          ? await deps.getProjectControlState(deps.projectId)
          : undefined;
        const ctx = {
          action: 'retrieve' as const,
          fromProjectId: deps.projectId,
          includeGlobal: true,
          projectPolicy: policy,
          targetProjectIds: [] as ProjectId[],
          targetProjectPolicies: {} as Record<string, typeof policy>,
          projectControlState: controlState,
        };
        const result = deps.policyEngine.evaluate(ctx);
        if (!result.allowed) return [];
      }
      return stubNotImpl('IProjectApi.memory', 'retrieve', 'Phase 7');
    },
  };

  model = {
    invoke: async (
      _role: ModelRole,
      _input: unknown,
    ): Promise<ModelResponse> => {
      return stubNotImpl('IProjectApi.model', 'invoke', 'Phase 7');
    },
    // eslint-disable-next-line require-yield -- stub throws before yielding
    stream: async function* (
      _role: ModelRole,
      _input: unknown,
    ): AsyncIterable<ModelStreamChunk> {
      stubNotImpl('IProjectApi.model', 'stream', 'Phase 7');
    },
  };

  tool = {
    execute: async (
      _name: string,
      _params: unknown,
    ): Promise<ToolResult> => {
      return stubNotImpl('IProjectApi.tool', 'execute', 'Phase 7');
    },
    list: async (
      _capabilities?: string[],
    ): Promise<ToolDefinition[]> => {
      return stubNotImpl('IProjectApi.tool', 'list', 'Phase 7');
    },
  };

  artifact = {
    store: async (_data: ArtifactWriteRequest): Promise<ArtifactWriteResult> => {
      return stubNotImpl('IProjectApi.artifact', 'store', 'Phase 7');
    },
    retrieve: async (_request: ArtifactReadRequest): Promise<ArtifactReadResult | null> => {
      return stubNotImpl('IProjectApi.artifact', 'retrieve', 'Phase 7');
    },
    list: async (
      _filters?: ArtifactListFilter,
    ): Promise<ArtifactVersionRecord[]> => {
      return stubNotImpl('IProjectApi.artifact', 'list', 'Phase 7');
    },
    delete: async (_request: ArtifactDeleteRequest): Promise<boolean> => {
      return stubNotImpl('IProjectApi.artifact', 'delete', 'Phase 7');
    },
  };

  escalation = {
    notify: async (
      _channel: EscalationChannel,
      _message: string,
    ): Promise<EscalationId> => {
      return stubNotImpl('IProjectApi.escalation', 'notify', 'Phase 7');
    },
    request: async (_decision: EscalationContract): Promise<EscalationResponse> => {
      return stubNotImpl('IProjectApi.escalation', 'request', 'Phase 7');
    },
  };

  scheduler = {
    register: async (_schedule: ScheduleDefinition): Promise<string> => {
      return stubNotImpl('IProjectApi.scheduler', 'register', 'Phase 7');
    },
    cancel: async (_id: string): Promise<boolean> => {
      return stubNotImpl('IProjectApi.scheduler', 'cancel', 'Phase 7');
    },
  };

  project = {
    config: (): ProjectConfig => {
      return stubNotImpl('IProjectApi.project', 'config', 'Phase 7');
    },
    state: (): ProjectState => {
      return stubNotImpl('IProjectApi.project', 'state', 'Phase 7');
    },
    log: (_event: NousEvent): void => {
      stubNotImpl('IProjectApi.project', 'log', 'Phase 7');
    },
  };
}
