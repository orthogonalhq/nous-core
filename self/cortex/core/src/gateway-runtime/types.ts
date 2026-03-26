import { z } from 'zod';
import type {
  AgentClass,
  AppHealthSnapshot,
  AppRuntimeSession,
  IDocumentStore,
  IAgentGateway,
  IAgentGatewayFactory,
  ICheckpointManager,
  IEventBus,
  IModelProvider,
  IModelRouter,
  IPromotedMemoryBridgeService,
  IProjectApi,
  IProjectStore,
  IRecoveryLedgerStore,
  IRecoveryOrchestrator,
  IToolExecutor,
  IWorkmodeAdmissionGuard,
  IPfcEngine,
  IScheduler,
  IEscalationService,
  IWorkflowEngine,
  IWitnessService,
  IRuntime,
  IAppRuntimeService,
  IAppCredentialInstallService,
  ICredentialVaultService,
  ICredentialInjector,
  IOpctlService,
  IngressDispatchOutcome,
  IngressTriggerEnvelope,
  ModelRequirements,
  ProjectId,
  ToolDefinition,
} from '@nous/shared';
import type { InternalMcpOutputSchemaValidator } from '../internal-mcp/types.js';
import {
  BacklogAnalyticsSchema,
  type BacklogEntry,
  type BacklogEntryStatus,
  type BacklogQueueConfig,
} from './backlog-types.js';

export const GatewayBootStepSchema = z.enum([
  'subcortex_initialized',
  'internal_mcp_registered',
  'principal_booted',
  'system_booted',
  'inbox_exchange_ready',
]);
export type GatewayBootStep = z.infer<typeof GatewayBootStepSchema>;

export const GatewayBootStatusSchema = z.enum(['booting', 'ready', 'degraded']);
export type GatewayBootStatus = z.infer<typeof GatewayBootStatusSchema>;

export const GatewaySubmissionSourceSchema = z.enum([
  'principal_tool',
  'scheduler',
  'system_event',
  'hook',
]);
export type GatewaySubmissionSource = z.infer<typeof GatewaySubmissionSourceSchema>;

export const GatewayHealthSnapshotSchema = z
  .object({
    agentClass: z.string().min(1),
    agentId: z.string().uuid(),
    visibleTools: z.array(z.string().min(1)),
    inboxReady: z.boolean(),
    lastAckAt: z.string().datetime().optional(),
    lastObservationAt: z.string().datetime().optional(),
    lastSubmissionAt: z.string().datetime().optional(),
    lastSubmissionSource: GatewaySubmissionSourceSchema.optional(),
    lastResultStatus: z
      .enum([
        'completed',
        'escalated',
        'aborted',
        'budget_exhausted',
        'error',
        'suspended',
      ])
      .optional(),
    backlogAnalytics: BacklogAnalyticsSchema,
    issueCodes: z.array(z.string().min(1)),
    appSessions: z.array(
      z.object({
        sessionId: z.string().min(1),
        appId: z.string().min(1),
        packageId: z.string().min(1),
        projectId: z.string().uuid().optional(),
        status: z.enum(['starting', 'active', 'draining', 'stopped', 'failed']),
        healthStatus: z.enum(['healthy', 'degraded', 'unhealthy', 'stale']),
        startedAt: z.string().datetime(),
        lastHeartbeatAt: z.string().datetime().optional(),
        stale: z.boolean(),
      }),
    ),
    // Escalation audit summary (Phase 1.1 — WR-054)
    escalationCount: z.number().int().nonnegative().optional(),
    lastEscalationAt: z.string().datetime().optional(),
    lastEscalationSeverity: z.string().optional(),
    // Checkpoint visibility (Phase 1.1 — WR-072)
    lastPreparedCheckpointId: z.string().optional(),
    lastCommittedCheckpointId: z.string().optional(),
    chainValid: z.boolean().optional(),
  })
  .strict();
export type GatewayHealthSnapshot = z.infer<typeof GatewayHealthSnapshotSchema>;

export const GatewayAppSessionHealthProjectionSchema = GatewayHealthSnapshotSchema.shape.appSessions
  .unwrap();
export type GatewayAppSessionHealthProjection = z.infer<
  typeof GatewayAppSessionHealthProjectionSchema
>;

export const GatewayBootSnapshotSchema = z
  .object({
    status: GatewayBootStatusSchema,
    completedSteps: z.array(GatewayBootStepSchema),
    stepTimestamps: z.record(z.string(), z.string().datetime()),
    issueCodes: z.array(z.string().min(1)),
  })
  .strict();
export type GatewayBootSnapshot = z.infer<typeof GatewayBootSnapshotSchema>;

export const SystemTaskSubmissionSchema = z
  .object({
    task: z.string().min(1),
    projectId: z.string().uuid().optional(),
    detail: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type SystemTaskSubmission = z.infer<typeof SystemTaskSubmissionSchema>;

export const SystemDirectiveInjectionSchema = z
  .object({
    directive: z.string().min(1),
    priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
    projectId: z.string().uuid().optional(),
    detail: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type SystemDirectiveInjection = z.infer<typeof SystemDirectiveInjectionSchema>;

export const SystemContextReplicaSchema = z
  .object({
    bootStatus: GatewayBootStatusSchema,
    inboxReady: z.boolean(),
    lastSubmissionAt: z.string().datetime().optional(),
    lastSubmissionSource: GatewaySubmissionSourceSchema.optional(),
    lastSystemResultStatus: z
      .enum([
        'completed',
        'escalated',
        'aborted',
        'budget_exhausted',
        'error',
        'suspended',
      ])
      .optional(),
    pendingSystemRuns: z.number().int().nonnegative(),
    backlogAnalytics: BacklogAnalyticsSchema,
    issueCodes: z.array(z.string().min(1)),
    visibleTools: z.array(z.string().min(1)),
    appSessions: z.array(GatewayAppSessionHealthProjectionSchema),
    // Escalation audit summary (Phase 1.1 — WR-054)
    escalationCount: z.number().int().nonnegative().optional(),
    lastEscalationAt: z.string().datetime().optional(),
    lastEscalationSeverity: z.string().optional(),
    // Checkpoint visibility (Phase 1.1 — WR-072)
    lastPreparedCheckpointId: z.string().optional(),
    lastCommittedCheckpointId: z.string().optional(),
    chainValid: z.boolean().optional(),
  })
  .strict();
export type SystemContextReplica = z.infer<typeof SystemContextReplicaSchema>;

export interface SystemSubmissionReceipt {
  runId: string;
  dispatchRef: string;
  acceptedAt: string;
  source: GatewaySubmissionSource;
}

/** Escalation audit trail summary projected through health sink. */
export interface EscalationAuditSummary {
  escalationCount: number;
  lastEscalationAt?: string;
  lastEscalationSeverity?: string;
}

/** Checkpoint lifecycle visibility projected through health sink. */
export interface CheckpointVisibilityStatus {
  lastPreparedCheckpointId?: string;
  lastCommittedCheckpointId?: string;
  chainValid?: boolean;
}

export interface PrincipalSystemGatewayRuntimeDeps {
  documentStore?: IDocumentStore;
  agentGatewayFactory?: IAgentGatewayFactory;
  modelRouter?: IModelRouter;
  getProvider?: (providerId: string) => IModelProvider | null;
  modelProviderByClass?: Partial<Record<AgentClass, IModelProvider>>;
  getProjectApi?: (projectId: ProjectId) => IProjectApi | null;
  toolExecutor?: IToolExecutor;
  pfc?: IPfcEngine;
  promotedMemoryBridgeService?: IPromotedMemoryBridgeService;
  workflowEngine?: IWorkflowEngine;
  projectStore?: IProjectStore;
  scheduler?: IScheduler;
  escalationService?: IEscalationService;
  witnessService?: IWitnessService;
  opctlService?: IOpctlService;
  runtime?: IRuntime;
  appRuntimeService?: IAppRuntimeService;
  credentialVaultService?: ICredentialVaultService;
  credentialInjector?: ICredentialInjector;
  appCredentialInstallService?: IAppCredentialInstallService;
  instanceRoot?: string;
  workmodeAdmissionGuard?: IWorkmodeAdmissionGuard;
  outputSchemaValidator?: InternalMcpOutputSchemaValidator;
  principalBaseSystemPrompt?: string;
  systemBaseSystemPrompt?: string;
  orchestratorBaseSystemPrompt?: string;
  workerBaseSystemPrompt?: string;
  defaultModelRequirements?: ModelRequirements;
  backlogConfig?: Partial<BacklogQueueConfig>;
  eventBus?: IEventBus;
  // Recovery component slots (Phase 1.1 — WR-072, wired in Phase 1.2)
  checkpointManager?: ICheckpointManager;
  recoveryLedgerStore?: IRecoveryLedgerStore;
  recoveryOrchestrator?: IRecoveryOrchestrator;
  now?: () => string;
  nowMs?: () => number;
  idFactory?: () => string;
}

export interface LaneLeaseReleasedEvent {
  laneKey: string;
  leaseId?: string;
}

export interface IPrincipalSystemGatewayRuntime {
  getPrincipalGateway(): IAgentGateway;
  getSystemGateway(): IAgentGateway;
  getBootSnapshot(): GatewayBootSnapshot;
  getGatewayHealth(agentClass: 'Cortex::Principal' | 'Cortex::System'): GatewayHealthSnapshot;
  getSystemContextReplica(): SystemContextReplica;
  getCheckpointStatus(): CheckpointVisibilityStatus;
  getEscalationAuditSummary(): EscalationAuditSummary;
  listPrincipalTools(): ToolDefinition[];
  listSystemTools(): ToolDefinition[];
  submitTaskToSystem(input: SystemTaskSubmission): Promise<SystemSubmissionReceipt>;
  injectDirectiveToSystem(input: SystemDirectiveInjection): Promise<SystemSubmissionReceipt>;
  submitIngressEnvelope(envelope: IngressTriggerEnvelope): Promise<IngressDispatchOutcome>;
  listBacklogEntries(filter?: { status?: BacklogEntryStatus }): Promise<BacklogEntry[]>;
  notifyLeaseReleased(event: LaneLeaseReleasedEvent): Promise<void>;
  whenIdle(): Promise<void>;
}

export interface GatewayAppSessionProjectionUpdate {
  session: Pick<
    AppRuntimeSession,
    | 'session_id'
    | 'app_id'
    | 'package_id'
    | 'project_id'
    | 'status'
    | 'health_status'
    | 'started_at'
    | 'last_heartbeat_at'
  >;
  health?: Pick<AppHealthSnapshot, 'status' | 'stale'>;
}
