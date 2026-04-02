/**
 * Agent gateway runtime interfaces for Nous-OSS.
 *
 * Phase 12.1 — compile-time contracts for the canonical AgentGateway
 * harness and its scoped dependencies.
 */
import type {
  AgentClass,
  AgentInput,
  AgentResult,
  DispatchOrchestratorRequest,
  DispatchWorkerRequest,
  GatewayAgentId,
  GatewayBudgetUsage,
  GatewayContextFrame,
  GatewayCorrelation,
  GatewayEscalationRequest,
  GatewayExecutionContext,
  GatewayInboxMessage,
  GatewayObservation,
  GatewayOutboxEvent,
  GatewayRunSnapshot,
  GatewayStampedPacket,
  GatewayTaskCompletionRequest,
  ModelRequirements,
  ModelRole,
  ProviderId,
  ToolDefinition,
  ToolResult,
  TraceEvidenceReference,
} from '../types/index.js';
import type { IModelProvider, IModelRouter, IWitnessService } from './subcortex.js';

export interface IGatewayInboxHandle {
  send(message: GatewayInboxMessage): Promise<void>;
  abort(reason: string): Promise<void>;
  injectContext(
    frameOrFrames: GatewayContextFrame | GatewayContextFrame[],
  ): Promise<void>;
}

export interface IGatewayOutboxSink {
  emit(event: GatewayOutboxEvent): Promise<void>;
}

export interface IScopedMcpToolSurface {
  listTools(): Promise<ToolDefinition[]>;
  executeTool(
    name: string,
    params: unknown,
    execution?: GatewayExecutionContext,
  ): Promise<ToolResult>;
}

export interface GatewayLifecycleContext {
  agentId: GatewayAgentId;
  agentClass: AgentClass;
  correlation: GatewayCorrelation;
  execution?: GatewayExecutionContext;
  usage: GatewayBudgetUsage;
  snapshot: GatewayRunSnapshot;
}

export interface GatewayTaskCompletionHookResult {
  output: unknown;
  v3Packet: GatewayStampedPacket;
  summary?: string;
  artifactRefs?: string[];
  evidenceRefs?: TraceEvidenceReference[];
}

export interface IGatewayLifecycleHooks {
  dispatchOrchestrator?(
    request: DispatchOrchestratorRequest,
    context: GatewayLifecycleContext,
  ): Promise<AgentResult>;
  dispatchWorker?(
    request: DispatchWorkerRequest,
    context: GatewayLifecycleContext,
  ): Promise<AgentResult>;
  taskComplete?(
    request: GatewayTaskCompletionRequest,
    context: GatewayLifecycleContext,
  ): Promise<GatewayTaskCompletionHookResult>;
  requestEscalation?(
    request: GatewayEscalationRequest,
    context: GatewayLifecycleContext,
  ): Promise<void>;
  flagObservation?(
    observation: GatewayObservation,
    context: GatewayLifecycleContext,
  ): Promise<void>;
}

export interface AgentGatewayConfig {
  agentClass: AgentClass;
  agentId: GatewayAgentId;
  toolSurface: IScopedMcpToolSurface;
  baseSystemPrompt?: string;
  modelRole?: ModelRole;
  defaultModelRequirements?: ModelRequirements;
  modelProvider?: IModelProvider;
  modelRouter?: IModelRouter;
  getProvider?: (providerId: ProviderId) => IModelProvider | null;
  lifecycleHooks?: IGatewayLifecycleHooks;
  outbox?: IGatewayOutboxSink;
  witnessService?: IWitnessService;
  now?: () => string;
  nowMs?: () => number;
  idFactory?: () => string;
}

export interface IAgentGateway {
  readonly agentClass: AgentClass;
  readonly agentId: GatewayAgentId;
  getInboxHandle(): IGatewayInboxHandle;
  run(input: AgentInput): Promise<AgentResult>;
}

export interface IAgentGatewayFactory {
  create(config: AgentGatewayConfig): IAgentGateway;
}
