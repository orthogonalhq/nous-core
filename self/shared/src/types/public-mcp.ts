import { z } from 'zod';
import { ToolDefinitionSchema } from './tools.js';
import { WitnessEventIdSchema } from './ids.js';
import { ConfidenceGovernanceEvaluationResultSchema } from './confidence-governance.js';

export const PublicMcpScopeSchema = z.enum([
  'ortho.memory.stm.read',
  'ortho.memory.stm.write',
  'ortho.memory.stm.delete',
  'ortho.memory.ltm.read',
  'ortho.memory.ltm.write',
  'ortho.memory.ltm.delete',
  'ortho.agents.invoke',
  'ortho.system.read',
  'ortho.admin',
]);
export type PublicMcpScope = z.infer<typeof PublicMcpScopeSchema>;

export const PublicMcpNamespaceSchema = z
  .string()
  .regex(/^app:[a-f0-9]{64}(?::[A-Za-z0-9._-]+)?$/);
export type PublicMcpNamespace = z.infer<typeof PublicMcpNamespaceSchema>;

export const PublicMcpRejectReasonSchema = z.enum([
  'missing_bearer',
  'invalid_token',
  'expired_token',
  'audience_mismatch',
  'origin_mismatch',
  'scope_insufficient',
  'client_metadata_unresolved',
  'namespace_invalid',
  'namespace_unauthorized',
  'request_schema_invalid',
  'sensitivity_ceiling_exceeded',
  'tool_not_available',
  'phase_not_enabled',
  'bootstrap_blocked',
  'source_quarantined',
  'quota_exceeded',
  'rate_limited',
  'agent_not_available',
  'memory_binding_forbidden',
  'task_not_found',
  'task_not_ready',
  'task_not_owned',
  'deployment_not_resolved',
  'tunnel_envelope_invalid',
  'tunnel_replay_detected',
]);
export type PublicMcpRejectReason = z.infer<typeof PublicMcpRejectReasonSchema>;

export const PublicMcpProtocolVersionSchema = z.literal('2025-11-25');
export type PublicMcpProtocolVersion = z.infer<typeof PublicMcpProtocolVersionSchema>;

export const PublicMcpMethodSchema = z.enum([
  'initialize',
  'tools/list',
  'tools/call',
  'tasks/get',
  'tasks/result',
]);
export type PublicMcpMethod = z.infer<typeof PublicMcpMethodSchema>;

export const PublicMcpRpcIdSchema = z.union([z.string().min(1), z.number(), z.null()]);
export type PublicMcpRpcId = z.infer<typeof PublicMcpRpcIdSchema>;

export const PublicMcpMemoryTierSchema = z.enum(['stm', 'ltm']);
export type PublicMcpMemoryTier = z.infer<typeof PublicMcpMemoryTierSchema>;

export const PublicMcpCompactionStrategySchema = z.enum([
  'summarize',
  'extract_facts',
]);
export type PublicMcpCompactionStrategy = z.infer<
  typeof PublicMcpCompactionStrategySchema
>;

export const PublicMcpScopeStrategySchema = z.enum([
  'static',
  'memory_read_by_tier',
  'memory_write_by_tier',
  'memory_delete_by_tier',
  'memory_compact_external',
  'agent_invoke_with_bindings',
]);
export type PublicMcpScopeStrategy = z.infer<typeof PublicMcpScopeStrategySchema>;

export const PublicMcpTaskSupportSchema = z.enum(['none', 'optional', 'required']);
export type PublicMcpTaskSupport = z.infer<typeof PublicMcpTaskSupportSchema>;

export const PublicMcpToolExecutionSchema = z.object({
  taskSupport: PublicMcpTaskSupportSchema.default('none'),
}).strict();
export type PublicMcpToolExecution = z.infer<typeof PublicMcpToolExecutionSchema>;

export const PublicMcpSourceLifecycleStateSchema = z.enum([
  'active',
  'quarantined',
  'purging',
  'purged',
]);
export type PublicMcpSourceLifecycleState = z.infer<
  typeof PublicMcpSourceLifecycleStateSchema
>;

export const PublicMcpClientMetadataSchema = z.object({
  clientId: z.string().min(1),
  allowedOrigins: z.array(z.string().url()).default([]),
  metadataDocumentUri: z.string().url().optional(),
}).strict();
export type PublicMcpClientMetadata = z.infer<typeof PublicMcpClientMetadataSchema>;

export const PublicMcpTokenClaimsSchema = z.object({
  clientId: z.string().min(1),
  audience: z.string().min(1),
  scopes: z.array(PublicMcpScopeSchema).default([]),
  expiresAt: z.string().datetime().optional(),
  origin: z.string().url().optional(),
  metadataDocumentUri: z.string().url().optional(),
  subspace: z.string().min(1).optional(),
  revoked: z.boolean().optional(),
}).strict();
export type PublicMcpTokenClaims = z.infer<typeof PublicMcpTokenClaimsSchema>;

export const PublicMcpSubjectSchema = z.object({
  class: z.literal('ExternalClient'),
  clientId: z.string().min(1),
  clientIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  tokenFingerprint: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  namespace: PublicMcpNamespaceSchema,
  scopes: z.array(PublicMcpScopeSchema),
  audience: z.string().min(1),
  origin: z.string().url().optional(),
  metadataDocumentUri: z.string().url().optional(),
}).strict();
export type PublicMcpSubject = z.infer<typeof PublicMcpSubjectSchema>;

export const PublicMcpToolDefinitionSchema = ToolDefinitionSchema.extend({
  name: z.string().regex(/^ortho\.[a-z0-9.]+$/),
  permissionScope: z.literal('external'),
  execution: PublicMcpToolExecutionSchema.optional(),
}).strict();
export type PublicMcpToolDefinition = z.infer<typeof PublicMcpToolDefinitionSchema>;

export const PublicMcpToolMappingEntrySchema = z.object({
  externalName: z.string().regex(/^ortho\.[a-z0-9.]+$/),
  internalName: z.string().regex(/^[a-z0-9_]+$/),
  requiredScopes: z.array(PublicMcpScopeSchema).default([]),
  scopeStrategy: PublicMcpScopeStrategySchema.default('static'),
  phaseAvailability: z.enum(['13.1', '13.2', '13.3']),
  enabledInCurrentPhase: z.boolean(),
  bootstrapMode: z.enum(['none', 'first_write']).default('none'),
  execution: PublicMcpToolExecutionSchema.optional(),
}).strict();
export type PublicMcpToolMappingEntry = z.infer<typeof PublicMcpToolMappingEntrySchema>;

export const PublicMcpAgentInputModeSchema = z.enum(['text', 'packet', 'json']);
export type PublicMcpAgentInputMode = z.infer<typeof PublicMcpAgentInputModeSchema>;

export const PublicMcpAsyncThresholdSchema = z.enum([
  'never',
  'long_running_only',
  'always_async',
]);
export type PublicMcpAsyncThreshold = z.infer<typeof PublicMcpAsyncThresholdSchema>;

export const PublicMcpAgentCatalogEntrySchema = z.object({
  agentId: z.string().regex(/^[a-z0-9._:-]+$/),
  title: z.string().min(1),
  description: z.string().min(1),
  inputModes: z.array(PublicMcpAgentInputModeSchema).min(1),
  memoryBinding: z.object({
    supported: z.boolean(),
    readTiers: z.array(PublicMcpMemoryTierSchema).default([]),
    writeTiers: z.array(PublicMcpMemoryTierSchema).default([]),
  }).strict(),
  execution: z.object({
    taskSupport: PublicMcpTaskSupportSchema,
    asyncThreshold: PublicMcpAsyncThresholdSchema,
  }).strict(),
  featureFlag: z.string().min(1).optional(),
}).strict();
export type PublicMcpAgentCatalogEntry = z.infer<typeof PublicMcpAgentCatalogEntrySchema>;

export const PublicMcpAgentMemoryBindingSchema = z.object({
  namespace: PublicMcpNamespaceSchema.optional(),
  readTiers: z.array(PublicMcpMemoryTierSchema).default([]),
  writeTiers: z.array(PublicMcpMemoryTierSchema).default([]),
}).strict();
export type PublicMcpAgentMemoryBinding = z.infer<typeof PublicMcpAgentMemoryBindingSchema>;

export const PublicMcpAgentInvokeInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('packet'),
    text: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('json'),
    payload: z.record(z.unknown()),
  }).strict(),
]);
export type PublicMcpAgentInvokeInput = z.infer<typeof PublicMcpAgentInvokeInputSchema>;

export const PublicMcpAgentOutputItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('packet'),
    text: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('json'),
    payload: z.record(z.unknown()),
  }).strict(),
]);
export type PublicMcpAgentOutputItem = z.infer<typeof PublicMcpAgentOutputItemSchema>;

export const PublicMcpAgentInvokeArgumentsSchema = z.object({
  agentId: z.string().regex(/^[a-z0-9._:-]+$/),
  input: PublicMcpAgentInvokeInputSchema,
  memory: PublicMcpAgentMemoryBindingSchema.optional(),
  executionMode: z.enum(['auto', 'sync', 'async']).default('auto'),
  idempotencyKey: z.string().min(1).optional(),
}).strict();
export type PublicMcpAgentInvokeArguments = z.infer<typeof PublicMcpAgentInvokeArgumentsSchema>;

export const PublicMcpAgentInvokeCompletedSchema = z.object({
  mode: z.literal('completed'),
  runId: z.string().min(1),
  outputs: z.array(PublicMcpAgentOutputItemSchema),
}).strict();
export type PublicMcpAgentInvokeCompleted = z.infer<typeof PublicMcpAgentInvokeCompletedSchema>;

export const PublicMcpTaskStatusSchema = z.enum([
  'queued',
  'running',
  'waiting',
  'completed',
  'failed',
  'blocked',
  'canceled',
]);
export type PublicMcpTaskStatus = z.infer<typeof PublicMcpTaskStatusSchema>;

export const PublicMcpTaskWaitReasonSchema = z.enum([
  'human_decision',
  'retry_backoff',
  'checkpoint_commit',
  'async_batch',
]);
export type PublicMcpTaskWaitReason = z.infer<typeof PublicMcpTaskWaitReasonSchema>;

export const PublicMcpAgentInvokeTaskAcceptedSchema = z.object({
  mode: z.literal('task'),
  task: z.object({
    taskId: z.string().min(1),
    status: z.enum(['queued', 'running', 'waiting']),
    runId: z.string().min(1),
  }).strict(),
}).strict();
export type PublicMcpAgentInvokeTaskAccepted = z.infer<typeof PublicMcpAgentInvokeTaskAcceptedSchema>;

export const PublicMcpAgentInvokeResultSchema = z.union([
  PublicMcpAgentInvokeCompletedSchema,
  PublicMcpAgentInvokeTaskAcceptedSchema,
]);
export type PublicMcpAgentInvokeResult = z.infer<typeof PublicMcpAgentInvokeResultSchema>;

export const PublicMcpTaskProjectionSchema = z.object({
  taskId: z.string().min(1),
  toolName: z.string().regex(/^ortho\.[a-z0-9.]+$/),
  subjectNamespace: PublicMcpNamespaceSchema,
  canonicalRunId: z.string().min(1),
  status: PublicMcpTaskStatusSchema,
  waitReason: PublicMcpTaskWaitReasonSchema.optional(),
  submittedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  errorCode: z.string().min(1).optional(),
}).strict();
export type PublicMcpTaskProjection = z.infer<typeof PublicMcpTaskProjectionSchema>;

export const PublicMcpTaskResultSchema = z.object({
  taskId: z.string().min(1),
  status: z.enum(['completed', 'failed', 'blocked', 'canceled']),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string().min(1),
  }).strict().optional(),
}).strict();
export type PublicMcpTaskResult = z.infer<typeof PublicMcpTaskResultSchema>;

export const PublicMcpSystemInfoSchema = z.object({
  server: z.object({
    name: z.string().min(1),
    phase: z.string().min(1),
    backendMode: z.enum(['local_tunnel', 'hosted', 'development']),
    protocolVersion: PublicMcpProtocolVersionSchema,
  }).strict(),
  features: z.object({
    publicAgents: z.boolean(),
    publicSystemInfo: z.boolean(),
    publicTasks: z.boolean(),
    publicCompactAsync: z.boolean(),
  }).strict(),
  limits: z.object({
    maxInvokeInputBytes: z.number().int().positive(),
    maxSearchTopK: z.number().int().positive().optional(),
    maxTaskPollWindowSeconds: z.number().int().positive(),
  }).strict(),
  quotas: z.object({
    invokePerMinute: z.number().int().positive(),
    compactPerMinute: z.number().int().positive().optional(),
  }).strict(),
  tasks: z.object({
    supportedMethods: z.array(z.enum(['tasks/get', 'tasks/result'])).default([]),
    toolSupport: z.record(PublicMcpTaskSupportSchema),
  }).strict(),
}).strict();
export type PublicMcpSystemInfo = z.infer<typeof PublicMcpSystemInfoSchema>;

export const PublicMcpDeploymentModeSchema = z.enum([
  'local_tunnel',
  'hosted',
  'development',
]);
export type PublicMcpDeploymentMode = z.infer<typeof PublicMcpDeploymentModeSchema>;

export const PublicMcpUserHandleSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9_-]{1,30}[a-z0-9])?$/);
export type PublicMcpUserHandle = z.infer<typeof PublicMcpUserHandleSchema>;

export const PublicMcpTunnelSessionRecordSchema = z.object({
  sessionId: z.string().min(1),
  userHandle: PublicMcpUserHandleSchema,
  host: z.string().min(1),
  sharedSecret: z.string().min(32),
  status: z.enum(['active', 'revoked']).default('active'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  lastSeenAt: z.string().datetime().optional(),
}).strict();
export type PublicMcpTunnelSessionRecord = z.infer<
  typeof PublicMcpTunnelSessionRecordSchema
>;

export const PublicMcpHostedTenantBindingRecordSchema = z.object({
  bindingId: z.string().min(1),
  tenantId: z.string().min(1),
  userHandle: PublicMcpUserHandleSchema,
  host: z.string().min(1),
  storePrefix: z.string().min(1),
  serverName: z.string().min(1).default('Nous Public MCP'),
  phase: z.string().min(1).default('phase-13.5'),
  status: z.enum(['active', 'disabled']).default('active'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type PublicMcpHostedTenantBindingRecord = z.infer<
  typeof PublicMcpHostedTenantBindingRecordSchema
>;

export const PublicMcpDeploymentAuditDetailSchema = z.object({
  mode: PublicMcpDeploymentModeSchema,
  requestHost: z.string().min(1),
  userHandle: PublicMcpUserHandleSchema.optional(),
  sessionId: z.string().min(1).optional(),
  bindingId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  storePrefix: z.string().min(1).optional(),
}).strict();
export type PublicMcpDeploymentAuditDetail = z.infer<
  typeof PublicMcpDeploymentAuditDetailSchema
>;

export const PublicMcpDeploymentResolutionSchema = PublicMcpDeploymentAuditDetailSchema.extend({
  serverName: z.string().min(1).optional(),
  phase: z.string().min(1).optional(),
}).strict();
export type PublicMcpDeploymentResolution = z.infer<
  typeof PublicMcpDeploymentResolutionSchema
>;

export const ExternalMemoryEntryIdSchema = z.string().min(1).max(128);
export type ExternalMemoryEntryId = z.infer<typeof ExternalMemoryEntryIdSchema>;

export const ExternalSourceLifecycleStatusSchema = z.enum([
  'active',
  'superseded',
  'soft-deleted',
]);
export type ExternalSourceLifecycleStatus = z.infer<
  typeof ExternalSourceLifecycleStatusSchema
>;

export const ExternalSourceOperationSchema = z.enum([
  'put',
  'compact_summary',
  'compact_extract_facts',
]);
export type ExternalSourceOperation = z.infer<typeof ExternalSourceOperationSchema>;

export const ExternalSourceMemoryEntrySchema = z.object({
  id: ExternalMemoryEntryIdSchema,
  namespace: PublicMcpNamespaceSchema,
  tier: PublicMcpMemoryTierSchema,
  content: z.string().min(1),
  tags: z.array(z.string().min(1)).max(16).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
  lifecycleStatus: ExternalSourceLifecycleStatusSchema.default('active'),
  supersededBy: ExternalMemoryEntryIdSchema.optional(),
  deletedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sourceOperation: ExternalSourceOperationSchema.default('put'),
  idempotencyKey: z.string().min(1).optional(),
}).strict();
export type ExternalSourceMemoryEntry = z.infer<typeof ExternalSourceMemoryEntrySchema>;

export const ExternalSourceSearchResultItemSchema = z.object({
  entry: ExternalSourceMemoryEntrySchema,
  score: z.number().min(0),
}).strict();
export type ExternalSourceSearchResultItem = z.infer<
  typeof ExternalSourceSearchResultItemSchema
>;

export const ExternalSourceMutationResultSchema = z.object({
  entry: ExternalSourceMemoryEntrySchema.optional(),
  entryId: ExternalMemoryEntryIdSchema.optional(),
  alreadyApplied: z.boolean().default(false),
}).strict();
export type ExternalSourceMutationResult = z.infer<
  typeof ExternalSourceMutationResultSchema
>;

export const ExternalSourceSearchResultSchema = z.object({
  entries: z.array(ExternalSourceSearchResultItemSchema),
}).strict();
export type ExternalSourceSearchResult = z.infer<typeof ExternalSourceSearchResultSchema>;

export const ExternalSourceCompactionResultSchema = z.object({
  strategy: PublicMcpCompactionStrategySchema,
  sourceTier: z.literal('stm'),
  sourceEntryCount: z.number().int().nonnegative(),
  derivedEntryIds: z.array(ExternalMemoryEntryIdSchema),
}).strict();
export type ExternalSourceCompactionResult = z.infer<
  typeof ExternalSourceCompactionResultSchema
>;

export const PromotedMemoryLifecycleStatusSchema = z.enum([
  'active',
  'demoted',
]);
export type PromotedMemoryLifecycleStatus = z.infer<
  typeof PromotedMemoryLifecycleStatusSchema
>;

export const PromotedMemoryKindSchema = z.enum([
  'document',
  'fact',
  'summary',
]);
export type PromotedMemoryKind = z.infer<typeof PromotedMemoryKindSchema>;

export const PromotedMemoryMutationActionSchema = z.enum([
  'promote',
  'demote',
]);
export type PromotedMemoryMutationAction = z.infer<
  typeof PromotedMemoryMutationActionSchema
>;

export const PromotedMemoryMutationOutcomeSchema = z.enum([
  'completed',
  'rejected',
  'failed',
]);
export type PromotedMemoryMutationOutcome = z.infer<
  typeof PromotedMemoryMutationOutcomeSchema
>;

export const PromotedSourceProvenanceSchema = z.object({
  sourceNamespace: PublicMcpNamespaceSchema,
  sourceRecordId: ExternalMemoryEntryIdSchema,
  sourceRecordKey: z.string().min(1),
  sourceTier: PublicMcpMemoryTierSchema,
  sourceCollection: z.string().min(1),
  sourceLifecycleStatus: ExternalSourceLifecycleStatusSchema,
  sourceOperation: ExternalSourceOperationSchema,
  sourceCreatedAt: z.string().datetime(),
  sourceUpdatedAt: z.string().datetime(),
  sourceDeletedAt: z.string().datetime().optional(),
  sourceSupersedesRecordId: ExternalMemoryEntryIdSchema.optional(),
  sourceSupersededByRecordId: ExternalMemoryEntryIdSchema.optional(),
  promotedAt: z.string().datetime(),
  promotedBySubject: z.literal('Cortex::System'),
}).strict();
export type PromotedSourceProvenance = z.infer<typeof PromotedSourceProvenanceSchema>;

export const PromotedMemoryRecordSchema = z.object({
  id: z.string().min(1),
  sourceRecordKey: z.string().min(1),
  content: z.string().min(1),
  kind: PromotedMemoryKindSchema.default('document'),
  tags: z.array(z.string().min(1)).max(16).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
  lifecycleStatus: PromotedMemoryLifecycleStatusSchema.default('active'),
  provenance: PromotedSourceProvenanceSchema,
  confidenceGovernance: ConfidenceGovernanceEvaluationResultSchema,
  promotionRationale: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
  tombstoneId: z.string().min(1).optional(),
}).strict();
export type PromotedMemoryRecord = z.infer<typeof PromotedMemoryRecordSchema>;

export const PromoteExternalRecordCommandSchema = z.object({
  requestId: z.string().min(1).optional(),
  requestedAt: z.string().datetime().optional(),
  sourceNamespace: PublicMcpNamespaceSchema,
  sourceRecordId: ExternalMemoryEntryIdSchema,
  expectedTier: PublicMcpMemoryTierSchema.optional(),
  rationale: z.string().min(1),
}).strict();
export type PromoteExternalRecordCommand = z.infer<
  typeof PromoteExternalRecordCommandSchema
>;

export const DemotePromotedRecordCommandSchema = z.object({
  requestId: z.string().min(1).optional(),
  requestedAt: z.string().datetime().optional(),
  promotedId: z.string().min(1),
  rationale: z.string().min(1),
}).strict();
export type DemotePromotedRecordCommand = z.infer<
  typeof DemotePromotedRecordCommandSchema
>;

export const PromotedMemoryGetQuerySchema = z.object({
  promotedId: z.string().min(1),
  includeDemoted: z.boolean().default(false),
}).strict();
export type PromotedMemoryGetQuery = z.infer<typeof PromotedMemoryGetQuerySchema>;

export const PromotedMemorySearchQuerySchema = z.object({
  text: z.string().min(1),
  topK: z.number().int().min(1).max(50).default(10),
  includeDemoted: z.boolean().default(false),
  sourceNamespace: PublicMcpNamespaceSchema.optional(),
}).strict();
export type PromotedMemorySearchQuery = z.infer<
  typeof PromotedMemorySearchQuerySchema
>;

export const PromotedMemorySearchResultItemSchema = z.object({
  record: PromotedMemoryRecordSchema,
  score: z.number().min(0),
}).strict();
export type PromotedMemorySearchResultItem = z.infer<
  typeof PromotedMemorySearchResultItemSchema
>;

export const PromotedMemorySearchResultSchema = z.object({
  entries: z.array(PromotedMemorySearchResultItemSchema),
}).strict();
export type PromotedMemorySearchResult = z.infer<
  typeof PromotedMemorySearchResultSchema
>;

export const PromotedMemoryTombstoneSchema = z.object({
  id: z.string().min(1),
  promotedId: z.string().min(1),
  sourceRecordKey: z.string().min(1),
  reason: z.string().min(1),
  createdAt: z.string().datetime(),
}).strict();
export type PromotedMemoryTombstone = z.infer<typeof PromotedMemoryTombstoneSchema>;

export const PromotedMemoryAuditRecordSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  action: PromotedMemoryMutationActionSchema,
  outcome: PromotedMemoryMutationOutcomeSchema,
  promotedId: z.string().min(1).optional(),
  sourceNamespace: PublicMcpNamespaceSchema.optional(),
  sourceRecordId: ExternalMemoryEntryIdSchema.optional(),
  sourceRecordKey: z.string().min(1).optional(),
  rationale: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  authorizationEventId: WitnessEventIdSchema.optional(),
  completionEventId: WitnessEventIdSchema.optional(),
  tombstoneId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
}).strict();
export type PromotedMemoryAuditRecord = z.infer<
  typeof PromotedMemoryAuditRecordSchema
>;

export const PublicMcpNamespaceRecordSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  clientId: z.string().min(1),
  clientIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  subspace: z.string().min(1).optional(),
  stmCollection: z.string().min(1),
  ltmCollection: z.string().min(1),
  mutationAuditCollection: z.string().min(1),
  tombstoneCollection: z.string().min(1),
  vectorCollection: z.string().min(1),
  bootstrapState: z.enum(['reserved', 'ready', 'blocked']).default('ready'),
  lifecycleState: PublicMcpSourceLifecycleStateSchema.default('active'),
  quarantineReason: z.string().min(1).optional(),
  quarantinedAt: z.string().datetime().optional(),
  purgedAt: z.string().datetime().optional(),
  quotaProfileId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
  lastMutationAt: z.string().datetime().optional(),
  lastCompactedAt: z.string().datetime().optional(),
}).strict();
export type PublicMcpNamespaceRecord = z.infer<typeof PublicMcpNamespaceRecordSchema>;

export const PublicMcpQuotaUsageRecordSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  tokenFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  windowStartedAt: z.string().datetime(),
  windowEndsAt: z.string().datetime(),
  readUnitsUsed: z.number().int().nonnegative(),
  writeUnitsUsed: z.number().int().nonnegative(),
  bytesReserved: z.number().int().nonnegative(),
  limitSnapshot: z.object({
    maxReadUnits: z.number().int().positive(),
    maxWriteUnits: z.number().int().positive(),
    maxBytesReserved: z.number().int().positive(),
  }).strict(),
  updatedAt: z.string().datetime(),
}).strict();
export type PublicMcpQuotaUsageRecord = z.infer<
  typeof PublicMcpQuotaUsageRecordSchema
>;

export const PublicMcpRateLimitBucketRecordSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  tokenFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  toolName: z.string().regex(/^ortho\.memory\.v1\./),
  windowStartedAt: z.string().datetime(),
  windowSeconds: z.number().int().positive(),
  requestCount: z.number().int().nonnegative(),
  blockedUntil: z.string().datetime().optional(),
  updatedAt: z.string().datetime(),
}).strict();
export type PublicMcpRateLimitBucketRecord = z.infer<
  typeof PublicMcpRateLimitBucketRecordSchema
>;

export const PublicMcpAuditRecordSchema = z.object({
  requestId: z.string().uuid(),
  timestamp: z.string().datetime(),
  oauthClientId: z.string().min(1),
  namespace: PublicMcpNamespaceSchema.optional(),
  toolName: z.string().min(1).optional(),
  internalToolName: z.string().min(1).optional(),
  tier: PublicMcpMemoryTierSchema.optional(),
  entryId: ExternalMemoryEntryIdSchema.optional(),
  lifecycleAction: z.enum(['quarantine', 'purge']).optional(),
  outcome: z.enum(['admitted', 'completed', 'rejected', 'blocked']),
  rejectReason: PublicMcpRejectReasonSchema.optional(),
  lifecycleState: PublicMcpSourceLifecycleStateSchema.optional(),
  quotaDecision: z.enum(['allow', 'reject']).optional(),
  rateLimitDecision: z.enum(['allow', 'reject']).optional(),
  latencyMs: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).optional(),
  authorizationEventId: WitnessEventIdSchema.optional(),
  completionEventId: WitnessEventIdSchema.optional(),
  createdAt: z.string().datetime(),
}).strict();
export type PublicMcpAuditRecord = z.infer<typeof PublicMcpAuditRecordSchema>;

export const PublicMcpPutArgumentsSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  tier: PublicMcpMemoryTierSchema,
  entryId: ExternalMemoryEntryIdSchema.optional(),
  content: z.string().min(1),
  mode: z.enum(['append', 'supersede']).default('append'),
  supersedesEntryId: ExternalMemoryEntryIdSchema.optional(),
  tags: z.array(z.string().min(1)).max(16).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
  idempotencyKey: z.string().min(1),
}).strict();
export type PublicMcpPutArguments = z.infer<typeof PublicMcpPutArgumentsSchema>;

export const PublicMcpGetArgumentsSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  tier: PublicMcpMemoryTierSchema,
  entryId: ExternalMemoryEntryIdSchema,
  includeDeleted: z.boolean().default(false),
}).strict();
export type PublicMcpGetArguments = z.infer<typeof PublicMcpGetArgumentsSchema>;

export const PublicMcpSearchArgumentsSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  tier: z.union([PublicMcpMemoryTierSchema, z.literal('both')]).default('both'),
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
  includeDeleted: z.boolean().default(false),
  tags: z.array(z.string().min(1)).max(16).optional(),
  after: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
}).strict();
export type PublicMcpSearchArguments = z.infer<typeof PublicMcpSearchArgumentsSchema>;

export const PublicMcpDeleteArgumentsSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  tier: PublicMcpMemoryTierSchema,
  entryId: ExternalMemoryEntryIdSchema,
  mode: z.literal('soft').default('soft'),
  reason: z.string().min(1).max(256).optional(),
  idempotencyKey: z.string().min(1).optional(),
}).strict();
export type PublicMcpDeleteArguments = z.infer<typeof PublicMcpDeleteArgumentsSchema>;

export const PublicMcpCompactArgumentsSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  sourceTier: z.literal('stm').default('stm'),
  strategy: PublicMcpCompactionStrategySchema,
  maxEntries: z.number().int().min(1).max(100).default(20),
  idempotencyKey: z.string().min(1).optional(),
}).strict();
export type PublicMcpCompactArguments = z.infer<typeof PublicMcpCompactArgumentsSchema>;

export const PublicMcpInitializeParamsSchema = z.object({
  protocolVersion: PublicMcpProtocolVersionSchema.optional(),
  capabilities: z.record(z.unknown()).optional(),
  clientInfo: z.object({
    name: z.string().min(1),
    version: z.string().min(1).optional(),
  }).passthrough().optional(),
}).passthrough();
export type PublicMcpInitializeParams = z.infer<typeof PublicMcpInitializeParamsSchema>;

export const PublicMcpToolsListParamsSchema = z.object({}).passthrough();
export type PublicMcpToolsListParams = z.infer<typeof PublicMcpToolsListParamsSchema>;

export const PublicMcpToolCallParamsSchema = z.object({
  name: z.string().regex(/^ortho\.[a-z0-9.]+$/),
  arguments: z.record(z.unknown()).default({}),
}).passthrough();
export type PublicMcpToolCallParams = z.infer<typeof PublicMcpToolCallParamsSchema>;

export const PublicMcpTaskGetParamsSchema = z.object({
  taskId: z.string().min(1),
}).strict();
export type PublicMcpTaskGetParams = z.infer<typeof PublicMcpTaskGetParamsSchema>;

export const PublicMcpTaskResultParamsSchema = z.object({
  taskId: z.string().min(1),
}).strict();
export type PublicMcpTaskResultParams = z.infer<typeof PublicMcpTaskResultParamsSchema>;

export const PublicMcpRpcRequestSchema = z.discriminatedUnion('method', [
  z.object({
    jsonrpc: z.literal('2.0'),
    id: PublicMcpRpcIdSchema.optional(),
    method: z.literal('initialize'),
    params: PublicMcpInitializeParamsSchema.optional(),
  }).strict(),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: PublicMcpRpcIdSchema.optional(),
    method: z.literal('tools/list'),
    params: PublicMcpToolsListParamsSchema.optional(),
  }).strict(),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: PublicMcpRpcIdSchema.optional(),
    method: z.literal('tools/call'),
    params: PublicMcpToolCallParamsSchema,
  }).strict(),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: PublicMcpRpcIdSchema.optional(),
    method: z.literal('tasks/get'),
    params: PublicMcpTaskGetParamsSchema,
  }).strict(),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: PublicMcpRpcIdSchema.optional(),
    method: z.literal('tasks/result'),
    params: PublicMcpTaskResultParamsSchema,
  }).strict(),
]);
export type PublicMcpRpcRequest = z.infer<typeof PublicMcpRpcRequestSchema>;

export const PublicMcpHttpRequestSchema = z.object({
  requestId: z.string().uuid(),
  method: z.enum(['GET', 'POST']),
  url: z.string().min(1),
  headers: z.record(z.string()),
  body: z.unknown().optional(),
  origin: z.string().url().optional(),
}).strict();
export type PublicMcpHttpRequest = z.infer<typeof PublicMcpHttpRequestSchema>;

export const PublicMcpProtectedResourceMetadataSchema = z.object({
  resource: z.string().min(1),
  authorization_servers: z.array(z.string().url()).min(1),
  bearer_methods_supported: z.array(z.string()).default(['header']),
  resource_documentation: z.string().url().optional(),
}).strict();
export type PublicMcpProtectedResourceMetadata = z.infer<
  typeof PublicMcpProtectedResourceMetadataSchema
>;

export const PublicMcpAuthorizationServerMetadataSchema = z.object({
  issuer: z.string().url(),
  token_endpoint: z.string().url().optional(),
  jwks_uri: z.string().url().optional(),
  response_types_supported: z.array(z.string()).default(['token']),
  grant_types_supported: z.array(z.string()).default(['client_credentials']),
  scopes_supported: z.array(PublicMcpScopeSchema).default([]),
}).strict();
export type PublicMcpAuthorizationServerMetadata = z.infer<
  typeof PublicMcpAuthorizationServerMetadataSchema
>;

export const PublicMcpDiscoveryBundleSchema = z.object({
  protectedResourceMetadata: PublicMcpProtectedResourceMetadataSchema,
  authorizationServerMetadata: PublicMcpAuthorizationServerMetadataSchema,
}).strict();
export type PublicMcpDiscoveryBundle = z.infer<typeof PublicMcpDiscoveryBundleSchema>;

export const PublicMcpAdmissionDecisionSchema = z.object({
  requestId: z.string().uuid(),
  outcome: z.enum(['admitted', 'rejected', 'discovery']),
  httpStatus: z.number().int().min(100).max(599),
  rejectReason: PublicMcpRejectReasonSchema.optional(),
  subject: PublicMcpSubjectSchema.optional(),
  witnessRefs: z.array(WitnessEventIdSchema).default([]),
  evaluatedAt: z.string().datetime(),
}).strict();
export type PublicMcpAdmissionDecision = z.infer<typeof PublicMcpAdmissionDecisionSchema>;

export const PublicMcpExecutionRequestSchema = z.object({
  requestId: z.string().uuid(),
  jsonrpc: z.literal('2.0'),
  rpcId: PublicMcpRpcIdSchema.optional(),
  protocolVersion: PublicMcpProtocolVersionSchema,
  method: PublicMcpMethodSchema,
  toolName: z.string().regex(/^ortho\.[a-z0-9.]+$/).optional(),
  arguments: z.record(z.unknown()).optional(),
  subject: PublicMcpSubjectSchema,
  requestUrl: z.string().url().optional(),
  idempotencyKey: z.string().min(1).optional(),
  requestedAt: z.string().datetime(),
}).strict();
export type PublicMcpExecutionRequest = z.infer<typeof PublicMcpExecutionRequestSchema>;

export const PublicMcpExecutionErrorSchema = z.object({
  code: z.number().int(),
  message: z.string().min(1),
  data: z.record(z.unknown()).optional(),
}).strict();
export type PublicMcpExecutionError = z.infer<typeof PublicMcpExecutionErrorSchema>;

export const PublicMcpExecutionResultSchema = z.object({
  requestId: z.string().uuid(),
  httpStatus: z.number().int().min(100).max(599),
  rpcId: PublicMcpRpcIdSchema.optional(),
  result: z.unknown().optional(),
  error: PublicMcpExecutionErrorSchema.optional(),
  rejectReason: PublicMcpRejectReasonSchema.optional(),
  internalToolName: z.string().min(1).optional(),
  authorizationEventId: WitnessEventIdSchema.optional(),
  completionEventId: WitnessEventIdSchema.optional(),
  auditRecordId: z.string().min(1).optional(),
}).strict();
export type PublicMcpExecutionResult = z.infer<typeof PublicMcpExecutionResultSchema>;

export const PublicMcpTunnelForwardEnvelopeSchema = z.object({
  envelopeId: z.string().min(1),
  requestId: z.string().uuid(),
  sessionId: z.string().min(1),
  userHandle: PublicMcpUserHandleSchema,
  nonce: z.string().min(1),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  request: PublicMcpExecutionRequestSchema,
  signature: z.string().min(1),
}).strict();
export type PublicMcpTunnelForwardEnvelope = z.infer<
  typeof PublicMcpTunnelForwardEnvelopeSchema
>;
