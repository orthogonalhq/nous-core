import {
  ArtifactReadRequestSchema,
  ArtifactWriteRequestSchema,
  EscalationContractSchema,
  type ExternalSourceCompactCommand,
  type ExternalSourceDeleteCommand,
  type ExternalSourceGetQuery,
  type ExternalSourcePutCommand,
  type ExternalSourceSearchQuery,
  DispatchOrchestratorRequestSchema,
  DispatchWorkerRequestSchema,
  GatewayEscalationRequestSchema,
  GatewayObservationSchema,
  GatewayTaskCompletionRequestSchema,
  MemoryScopeSchema,
  MemoryWriteCandidateSchema,
  PublicMcpCompactArgumentsSchema,
  PublicMcpDeleteArgumentsSchema,
  PublicMcpAgentInvokeArgumentsSchema,
  PublicMcpExecutionRequestSchema,
  PublicMcpGetArgumentsSchema,
  PublicMcpPutArgumentsSchema,
  PublicMcpSearchArgumentsSchema,
  PromoteExternalRecordCommandSchema,
  DemotePromotedRecordCommandSchema,
  PromotedMemoryGetQuerySchema,
  PromotedMemorySearchQuerySchema,
  ValidationError,
  WitnessCheckpointReasonSchema,
  ScheduleDefinitionSchema,
  type ArtifactReadRequest,
  type ArtifactWriteRequest,
  type DemotePromotedRecordCommand,
  type EscalationContract,
  type PromoteExternalRecordCommand,
  type PromotedMemoryGetQuery,
  type PromotedMemorySearchQuery,
  type PublicMcpAgentInvokeArguments,
  type PublicMcpExecutionRequest,
  type DispatchOrchestratorRequest,
  type DispatchWorkerRequest,
  type GatewayEscalationRequest,
  type GatewayObservation,
  type GatewayTaskCompletionRequest,
  type MemoryWriteCandidate,
  type ScheduleDefinition,
  type WorkflowLifecycleCancelCommand,
  type WorkflowLifecycleInspectQuery,
  type WorkflowLifecycleListQuery,
  type WorkflowLifecyclePauseCommand,
  type WorkflowLifecycleResumeCommand,
  type WorkflowLifecycleStartCommand,
  type WorkflowLifecycleStatusQuery,
  type WorkflowLifecycleValidateCommand,
  type WorkflowLifecycleFromSpecCommand,
  type WorkflowLifecycleCreateCommand,
  type WorkflowLifecycleUpdateCommand,
  type WorkflowLifecycleDeleteCommand,
  type WorkflowExecuteNodeToolRequest,
  type WorkflowCompleteNodeToolRequest,
  WorkflowExecuteNodeToolRequestSchema,
  WorkflowCompleteNodeToolRequestSchema,
  WorkflowLifecycleCancelCommandSchema,
  WorkflowLifecycleFromSpecCommandSchema,
  WorkflowLifecycleCreateCommandSchema,
  WorkflowLifecycleUpdateCommandSchema,
  WorkflowLifecycleDeleteCommandSchema,
  WorkflowLifecycleInspectQuerySchema,
  WorkflowLifecycleListQuerySchema,
  WorkflowLifecyclePauseCommandSchema,
  WorkflowLifecycleResumeCommandSchema,
  WorkflowLifecycleStartCommandSchema,
  WorkflowLifecycleStatusQuerySchema,
  WorkflowLifecycleValidateCommandSchema,
  AppHealthSnapshotSchema,
  AppHeartbeatSignalSchema,
  CredentialInjectRequestSchema,
  CredentialRevokeRequestSchema,
  CredentialStoreRequestSchema,
  type CredentialInjectRequest,
  type CredentialRevokeRequest,
  type CredentialStoreRequest,
} from '@nous/shared';
import { z } from 'zod';

const MemorySearchReadRequestSchema = z
  .object({
    mode: z.literal('read'),
    query: z.string().min(1),
    scope: MemoryScopeSchema,
  })
  .strict();

const MemorySearchRetrieveRequestSchema = z
  .object({
    mode: z.literal('retrieve'),
    situation: z.string().min(1),
    budget: z.number().int().positive(),
  })
  .strict();

export const MemorySearchRequestSchema = z.discriminatedUnion('mode', [
  MemorySearchReadRequestSchema,
  MemorySearchRetrieveRequestSchema,
]);
export type MemorySearchRequest = z.infer<typeof MemorySearchRequestSchema>;

export const ProjectDiscoverRequestSchema = z
  .object({
    includeConfig: z.boolean().optional(),
    includeState: z.boolean().optional(),
  })
  .strict()
  .transform((value) => ({
    includeConfig: value.includeConfig ?? true,
    includeState: value.includeState ?? true,
  }));
export type ProjectDiscoverRequest = z.output<typeof ProjectDiscoverRequestSchema>;

export const ArtifactStoreRequestSchema = ArtifactWriteRequestSchema.omit({
  projectId: true,
});
export type ArtifactStoreRequest = Omit<ArtifactWriteRequest, 'projectId'>;

export const ArtifactRetrieveRequestSchema = ArtifactReadRequestSchema.omit({
  projectId: true,
});
export type ArtifactRetrieveRequest = Omit<ArtifactReadRequest, 'projectId'>;

export const ToolExecuteRequestSchema = z
  .object({
    name: z.string().min(1),
    params: z.unknown().optional(),
  })
  .strict();
export type ToolExecuteRequest = z.infer<typeof ToolExecuteRequestSchema>;

export const ToolListRequestSchema = z
  .object({
    capabilities: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type ToolListRequest = z.infer<typeof ToolListRequestSchema>;

export const WitnessCheckpointRequestSchema = z
  .object({
    reason: WitnessCheckpointReasonSchema.optional(),
  })
  .strict();
export type WitnessCheckpointRequest = z.infer<
  typeof WitnessCheckpointRequestSchema
>;

export const EscalationNotifyRequestSchema = EscalationContractSchema.omit({
  projectId: true,
});
export type EscalationNotifyRequest = Omit<EscalationContract, 'projectId'>;

export const SchedulerRegisterRequestSchema = ScheduleDefinitionSchema.omit({
  projectId: true,
});
export type SchedulerRegisterRequest = Omit<ScheduleDefinition, 'projectId'>;
export type WorkflowListRequest = WorkflowLifecycleListQuery;
export type WorkflowInspectRequest = WorkflowLifecycleInspectQuery;
export type WorkflowStartRequest = WorkflowLifecycleStartCommand;
export type WorkflowStatusRequest = WorkflowLifecycleStatusQuery;
export type WorkflowPauseRequest = WorkflowLifecyclePauseCommand;
export type WorkflowResumeRequest = WorkflowLifecycleResumeCommand;
export type WorkflowCancelRequest = WorkflowLifecycleCancelCommand;
export type WorkflowValidateRequest = WorkflowLifecycleValidateCommand;
export type WorkflowFromSpecRequest = WorkflowLifecycleFromSpecCommand;
export type AppHealthReportRequest = z.infer<typeof AppHealthReportRequestSchema>;
export type AppHeartbeatRequest = z.infer<typeof AppHeartbeatRequestSchema>;
export type AppCredentialStoreRequest = CredentialStoreRequest;
export type AppCredentialInjectRequest = CredentialInjectRequest;
export type AppCredentialRevokeRequest = CredentialRevokeRequest;
export type { PublicMcpAgentInvokeArguments, PublicMcpExecutionRequest };

export const AppHealthReportRequestSchema = AppHealthSnapshotSchema.strict();
export const AppHeartbeatRequestSchema = AppHeartbeatSignalSchema.strict();
export const AppCredentialStoreRequestSchema = CredentialStoreRequestSchema.strict();
export const AppCredentialInjectRequestSchema = CredentialInjectRequestSchema.strict();
export const AppCredentialRevokeRequestSchema = CredentialRevokeRequestSchema.strict();

export function parsePromotedMemoryPromoteCommand(
  params: unknown,
): PromoteExternalRecordCommand {
  return PromoteExternalRecordCommandSchema.parse(params ?? {});
}

export function parsePromotedMemoryDemoteCommand(
  params: unknown,
): DemotePromotedRecordCommand {
  return DemotePromotedRecordCommandSchema.parse(params ?? {});
}

export function parsePromotedMemoryGetQuery(
  params: unknown,
): PromotedMemoryGetQuery {
  return PromotedMemoryGetQuerySchema.parse(params ?? {});
}

export function parsePromotedMemorySearchQuery(
  params: unknown,
): PromotedMemorySearchQuery {
  return PromotedMemorySearchQuerySchema.parse(params ?? {});
}

function parseExternalExecutionRequest(params: unknown) {
  return PublicMcpExecutionRequestSchema.parse(params ?? {});
}

export function parsePublicMcpExecutionRequest(
  params: unknown,
): PublicMcpExecutionRequest {
  return PublicMcpExecutionRequestSchema.parse(params ?? {});
}

export function parsePublicMcpAgentInvokeArguments(
  params: unknown,
): PublicMcpAgentInvokeArguments {
  return PublicMcpAgentInvokeArgumentsSchema.parse(params ?? {});
}

export function normalizeDispatchOrchestratorParams(
  params: unknown,
): DispatchOrchestratorRequest {
  if (params && typeof params === 'object') {
    const raw = params as Record<string, unknown>;
    return DispatchOrchestratorRequestSchema.parse({
      dispatchIntent: raw.dispatchIntent ?? raw.dispatch_intent,
      taskInstructions: raw.taskInstructions ?? raw.task_instructions,
      budget: raw.budget,
    });
  }
  return DispatchOrchestratorRequestSchema.parse(params ?? {});
}

export function normalizeDispatchWorkerParams(
  params: unknown,
): DispatchWorkerRequest {
  if (params && typeof params === 'object') {
    const raw = params as Record<string, unknown>;
    return DispatchWorkerRequestSchema.parse({
      taskInstructions: raw.taskInstructions ?? raw.task_instructions,
      nodeDefinitionId: raw.nodeDefinitionId ?? raw.node_id,
      payload: raw.payload,
      budget: raw.budget,
    });
  }
  return DispatchWorkerRequestSchema.parse(params ?? {});
}

export function normalizeTaskCompletionParams(
  params: unknown,
): GatewayTaskCompletionRequest {
  if (params && typeof params === 'object') {
    const raw = params as Record<string, unknown>;
    return GatewayTaskCompletionRequestSchema.parse({
      output: raw.output,
      artifactRefs: raw.artifactRefs ?? raw.artifact_refs,
      summary: raw.summary,
    });
  }

  return GatewayTaskCompletionRequestSchema.parse(params ?? {});
}

export function normalizeEscalationParams(
  params: unknown,
): GatewayEscalationRequest {
  if (params && typeof params === 'object') {
    const raw = params as Record<string, unknown>;
    return GatewayEscalationRequestSchema.parse({
      reason: raw.reason,
      severity: raw.severity,
      detail: raw.detail,
      contextSnapshot: raw.contextSnapshot ?? raw.context_snapshot,
    });
  }

  return GatewayEscalationRequestSchema.parse(params ?? {});
}

export function normalizeObservationParams(params: unknown): GatewayObservation {
  if (params && typeof params === 'object') {
    const raw = params as Record<string, unknown>;
    return GatewayObservationSchema.parse({
      observationType: raw.observationType ?? raw.observation_type,
      content: raw.content,
      detail: raw.detail,
    });
  }

  return GatewayObservationSchema.parse(params ?? {});
}

export function parseMemorySearchRequest(params: unknown): MemorySearchRequest {
  return MemorySearchRequestSchema.parse(params ?? {});
}

export function parseMemoryWriteRequest(params: unknown): MemoryWriteCandidate {
  return MemoryWriteCandidateSchema.parse(params ?? {});
}

export function parseProjectDiscoverRequest(
  params: unknown,
): ProjectDiscoverRequest {
  return ProjectDiscoverRequestSchema.parse(params ?? {});
}

export function parseArtifactStoreRequest(params: unknown): ArtifactStoreRequest {
  return ArtifactStoreRequestSchema.parse(params ?? {});
}

export function parseArtifactRetrieveRequest(
  params: unknown,
): ArtifactRetrieveRequest {
  return ArtifactRetrieveRequestSchema.parse(params ?? {});
}

export function parseToolExecuteRequest(params: unknown): ToolExecuteRequest {
  return ToolExecuteRequestSchema.parse(params ?? {});
}

export function parseToolListRequest(params: unknown): ToolListRequest {
  return ToolListRequestSchema.parse(params ?? {});
}

export function parseWitnessCheckpointRequest(
  params: unknown,
): WitnessCheckpointRequest {
  return WitnessCheckpointRequestSchema.parse(params ?? {});
}

export function parseEscalationNotifyRequest(
  params: unknown,
): EscalationNotifyRequest {
  return EscalationNotifyRequestSchema.parse(params ?? {});
}

export function parseSchedulerRegisterRequest(
  params: unknown,
): SchedulerRegisterRequest {
  return SchedulerRegisterRequestSchema.parse(params ?? {});
}

export function parseWorkflowListRequest(params: unknown): WorkflowListRequest {
  return WorkflowLifecycleListQuerySchema.parse(params ?? {});
}

export function parseWorkflowInspectRequest(
  params: unknown,
): WorkflowInspectRequest {
  return WorkflowLifecycleInspectQuerySchema.parse(params ?? {});
}

export function parseWorkflowStartRequest(params: unknown): WorkflowStartRequest {
  return WorkflowLifecycleStartCommandSchema.parse(params ?? {});
}

export function parseWorkflowStatusRequest(
  params: unknown,
): WorkflowStatusRequest {
  return WorkflowLifecycleStatusQuerySchema.parse(params ?? {});
}

export function parseWorkflowPauseRequest(params: unknown): WorkflowPauseRequest {
  return WorkflowLifecyclePauseCommandSchema.parse(params ?? {});
}

export function parseWorkflowResumeRequest(
  params: unknown,
): WorkflowResumeRequest {
  return WorkflowLifecycleResumeCommandSchema.parse(params ?? {});
}

export function parseWorkflowCancelRequest(
  params: unknown,
): WorkflowCancelRequest {
  return WorkflowLifecycleCancelCommandSchema.parse(params ?? {});
}

export function parseWorkflowValidateRequest(
  params: unknown,
): WorkflowValidateRequest {
  return WorkflowLifecycleValidateCommandSchema.parse(params ?? {});
}

export function parseWorkflowFromSpecRequest(
  params: unknown,
): WorkflowFromSpecRequest {
  return WorkflowLifecycleFromSpecCommandSchema.parse(params ?? {});
}

export function parseWorkflowCreateRequest(
  params: unknown,
): WorkflowLifecycleCreateCommand {
  return WorkflowLifecycleCreateCommandSchema.parse(params ?? {});
}

export function parseWorkflowUpdateRequest(
  params: unknown,
): WorkflowLifecycleUpdateCommand {
  return WorkflowLifecycleUpdateCommandSchema.parse(params ?? {});
}

export function parseWorkflowDeleteRequest(
  params: unknown,
): WorkflowLifecycleDeleteCommand {
  return WorkflowLifecycleDeleteCommandSchema.parse(params ?? {});
}

export function parseWorkflowAuthoringReferenceRequest(
  _params: unknown,
): Record<string, never> {
  return {};
}

export function parseWorkflowExecuteNodeRequest(
  params: unknown,
): WorkflowExecuteNodeToolRequest {
  return WorkflowExecuteNodeToolRequestSchema.parse(params ?? {});
}

export function parseWorkflowCompleteNodeRequest(
  params: unknown,
): WorkflowCompleteNodeToolRequest {
  return WorkflowCompleteNodeToolRequestSchema.parse(params ?? {});
}

export function parseHealthReportRequest(
  params: unknown,
): AppHealthReportRequest {
  return AppHealthReportRequestSchema.parse(params ?? {});
}

export function parseHealthHeartbeatRequest(
  params: unknown,
): AppHeartbeatRequest {
  return AppHeartbeatRequestSchema.parse(params ?? {});
}

export function parseCredentialStoreRequest(
  params: unknown,
): AppCredentialStoreRequest {
  return AppCredentialStoreRequestSchema.parse(params ?? {});
}

export function parseCredentialInjectRequest(
  params: unknown,
): AppCredentialInjectRequest {
  return AppCredentialInjectRequestSchema.parse(params ?? {});
}

export function parseCredentialRevokeRequest(
  params: unknown,
): AppCredentialRevokeRequest {
  return AppCredentialRevokeRequestSchema.parse(params ?? {});
}

export function parseExternalMemoryPutCommand(
  params: unknown,
): ExternalSourcePutCommand {
  const request = parseExternalExecutionRequest(params);
  return {
    requestId: request.requestId,
    subject: request.subject,
    requestedAt: request.requestedAt,
    idempotencyKey: request.idempotencyKey,
    arguments: PublicMcpPutArgumentsSchema.parse(request.arguments ?? {}),
  };
}

export function parseExternalMemoryGetQuery(
  params: unknown,
): ExternalSourceGetQuery {
  const request = parseExternalExecutionRequest(params);
  return {
    requestId: request.requestId,
    subject: request.subject,
    requestedAt: request.requestedAt,
    idempotencyKey: request.idempotencyKey,
    arguments: PublicMcpGetArgumentsSchema.parse(request.arguments ?? {}),
  };
}

export function parseExternalMemorySearchQuery(
  params: unknown,
): ExternalSourceSearchQuery {
  const request = parseExternalExecutionRequest(params);
  return {
    requestId: request.requestId,
    subject: request.subject,
    requestedAt: request.requestedAt,
    idempotencyKey: request.idempotencyKey,
    arguments: PublicMcpSearchArgumentsSchema.parse(request.arguments ?? {}),
  };
}

export function parseExternalMemoryDeleteCommand(
  params: unknown,
): ExternalSourceDeleteCommand {
  const request = parseExternalExecutionRequest(params);
  return {
    requestId: request.requestId,
    subject: request.subject,
    requestedAt: request.requestedAt,
    idempotencyKey: request.idempotencyKey,
    arguments: PublicMcpDeleteArgumentsSchema.parse(request.arguments ?? {}),
  };
}

export function parseExternalMemoryCompactCommand(
  params: unknown,
): ExternalSourceCompactCommand {
  const request = parseExternalExecutionRequest(params);
  return {
    requestId: request.requestId,
    subject: request.subject,
    requestedAt: request.requestedAt,
    idempotencyKey: request.idempotencyKey,
    arguments: PublicMcpCompactArgumentsSchema.parse(request.arguments ?? {}),
  };
}

export function toValidationError(message: string, error: unknown): ValidationError {
  if (error instanceof ValidationError) {
    return error;
  }

  if (error instanceof z.ZodError) {
    return new ValidationError(
      message,
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  return new ValidationError(message, [
    {
      path: '',
      message: error instanceof Error ? error.message : String(error),
    },
  ]);
}
