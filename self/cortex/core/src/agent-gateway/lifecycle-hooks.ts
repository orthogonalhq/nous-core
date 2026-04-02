import {
  type DispatchOrchestratorRequest,
  type DispatchWorkerRequest,
  type GatewayEscalationRequest,
  type GatewayObservation,
  type GatewayTaskCompletionRequest,
} from '@nous/shared';
import {
  normalizeDispatchOrchestratorParams,
  normalizeDispatchWorkerParams,
  normalizeEscalationParams,
  normalizeObservationParams,
  normalizeTaskCompletionParams,
} from '../internal-mcp/request-normalizers.js';

export const DISPATCH_ORCHESTRATOR_TOOL_NAME = 'dispatch_orchestrator';
export const DISPATCH_WORKER_TOOL_NAME = 'dispatch_worker';
export const TASK_COMPLETE_TOOL_NAME = 'task_complete';
export const REQUEST_ESCALATION_TOOL_NAME = 'request_escalation';
export const FLAG_OBSERVATION_TOOL_NAME = 'flag_observation';

export type LifecycleToolName =
  | typeof DISPATCH_ORCHESTRATOR_TOOL_NAME
  | typeof DISPATCH_WORKER_TOOL_NAME
  | typeof TASK_COMPLETE_TOOL_NAME
  | typeof REQUEST_ESCALATION_TOOL_NAME
  | typeof FLAG_OBSERVATION_TOOL_NAME;

export function isLifecycleToolName(name: string): name is LifecycleToolName {
  return (
    name === DISPATCH_ORCHESTRATOR_TOOL_NAME ||
    name === DISPATCH_WORKER_TOOL_NAME ||
    name === TASK_COMPLETE_TOOL_NAME ||
    name === REQUEST_ESCALATION_TOOL_NAME ||
    name === FLAG_OBSERVATION_TOOL_NAME
  );
}

export function isDispatchToolName(name: string): boolean {
  return name === DISPATCH_ORCHESTRATOR_TOOL_NAME || name === DISPATCH_WORKER_TOOL_NAME;
}

export function parseDispatchOrchestratorRequest(params: unknown): DispatchOrchestratorRequest {
  return normalizeDispatchOrchestratorParams(params);
}

export function parseDispatchWorkerRequest(params: unknown): DispatchWorkerRequest {
  return normalizeDispatchWorkerParams(params);
}

export function parseTaskCompletionRequest(
  params: unknown,
): GatewayTaskCompletionRequest {
  return normalizeTaskCompletionParams(params);
}

export function parseEscalationRequest(
  params: unknown,
): GatewayEscalationRequest {
  return normalizeEscalationParams(params);
}

export function parseObservation(params: unknown): GatewayObservation {
  return normalizeObservationParams(params);
}

export function getLifecycleUnavailableMessage(name: LifecycleToolName): string {
  return `Lifecycle tool ${name} is not available in this gateway instance`;
}
