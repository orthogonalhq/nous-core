import {
  ArtifactReadRequestSchema,
  ArtifactWriteRequestSchema,
  EscalationContractSchema,
  type ExternalSourceCompactCommand,
  type ExternalSourceDeleteCommand,
  type ExternalSourceGetQuery,
  type ExternalSourcePutCommand,
  type ExternalSourceSearchQuery,
  GatewayDispatchRequestSchema,
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
  ValidationError,
  WitnessCheckpointReasonSchema,
  ScheduleDefinitionSchema,
  type ArtifactReadRequest,
  type ArtifactWriteRequest,
  type EscalationContract,
  type PublicMcpAgentInvokeArguments,
  type PublicMcpExecutionRequest,
  type GatewayDispatchRequest,
  type GatewayEscalationRequest,
  type GatewayObservation,
  type GatewayTaskCompletionRequest,
  type MemoryWriteCandidate,
  type ScheduleDefinition,
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
export type { PublicMcpAgentInvokeArguments, PublicMcpExecutionRequest };

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

export function normalizeDispatchParams(params: unknown): GatewayDispatchRequest {
  if (params && typeof params === 'object') {
    const raw = params as Record<string, unknown>;
    return GatewayDispatchRequestSchema.parse({
      targetClass: raw.targetClass ?? raw.target_class,
      taskInstructions: raw.taskInstructions ?? raw.task_instructions,
      payload: raw.payload,
      budget: raw.budget,
      nodeDefinitionId: raw.nodeDefinitionId ?? raw.node_id,
    });
  }

  return GatewayDispatchRequestSchema.parse(params ?? {});
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
