import {
  GatewayDispatchRequestSchema,
  GatewayEscalationRequestSchema,
  GatewayObservationSchema,
  GatewayTaskCompletionRequestSchema,
  type GatewayDispatchRequest,
  type GatewayEscalationRequest,
  type GatewayObservation,
  type GatewayTaskCompletionRequest,
} from '@nous/shared';

export const DISPATCH_AGENT_TOOL_NAME = 'dispatch_agent';
export const TASK_COMPLETE_TOOL_NAME = 'task_complete';
export const REQUEST_ESCALATION_TOOL_NAME = 'request_escalation';
export const FLAG_OBSERVATION_TOOL_NAME = 'flag_observation';

export type LifecycleToolName =
  | typeof DISPATCH_AGENT_TOOL_NAME
  | typeof TASK_COMPLETE_TOOL_NAME
  | typeof REQUEST_ESCALATION_TOOL_NAME
  | typeof FLAG_OBSERVATION_TOOL_NAME;

export function isLifecycleToolName(name: string): name is LifecycleToolName {
  return (
    name === DISPATCH_AGENT_TOOL_NAME ||
    name === TASK_COMPLETE_TOOL_NAME ||
    name === REQUEST_ESCALATION_TOOL_NAME ||
    name === FLAG_OBSERVATION_TOOL_NAME
  );
}

export function parseDispatchRequest(params: unknown): GatewayDispatchRequest {
  return GatewayDispatchRequestSchema.parse(params ?? {});
}

export function parseTaskCompletionRequest(
  params: unknown,
): GatewayTaskCompletionRequest {
  return GatewayTaskCompletionRequestSchema.parse(params ?? {});
}

export function parseEscalationRequest(
  params: unknown,
): GatewayEscalationRequest {
  return GatewayEscalationRequestSchema.parse(params ?? {});
}

export function parseObservation(params: unknown): GatewayObservation {
  if (
    params &&
    typeof params === 'object' &&
    'observation_type' in params &&
    !('observationType' in params)
  ) {
    const raw = params as {
      observation_type: unknown;
      content: unknown;
      detail?: unknown;
    };
    return GatewayObservationSchema.parse({
      observationType: raw.observation_type,
      content: raw.content,
      detail: raw.detail,
    });
  }

  return GatewayObservationSchema.parse(params ?? {});
}

export function getLifecycleUnavailableMessage(name: LifecycleToolName): string {
  return `Lifecycle tool ${name} is not available in this gateway instance`;
}
