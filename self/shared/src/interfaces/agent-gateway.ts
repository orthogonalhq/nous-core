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
  TraceId,
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

// ── Strategy injection types (WR-127) ────────────────────────────────

/** Input to the prompt formatter — agent-type axis composition */
export interface PromptFormatterInput {
  readonly agentClass: AgentClass;
  readonly taskInstructions: string;
  readonly baseSystemPrompt?: string;
  readonly execution?: GatewayExecutionContext;
  readonly tools?: ToolDefinition[];
  readonly personalityConfig?: unknown;
}

/** Output from the prompt formatter */
export interface PromptFormatterOutput {
  readonly systemPrompt: string | string[];
  readonly toolDefinitions?: ToolDefinition[];
}

/** Prompt composition strategy — agent-type axis */
export type PromptFormatter = (input: PromptFormatterInput) => PromptFormatterOutput;

/**
 * Response parsing strategy — converts provider output to canonical form.
 * Return type is `unknown` at the @nous/shared boundary; cortex-core
 * narrows to `ParsedModelOutput` at the gateway implementation site.
 */
export type ResponseParser = (output: unknown, traceId: TraceId) => unknown;

/** Context budget defaults */
export interface ContextDefaults {
  readonly maxContextTokens?: number;
  /** Compaction threshold as ratio of context window (0-1) */
  readonly compactionThreshold?: number;
  readonly compactionStrategyId?: string;
}

/** Per-profile context budget defaults and compaction strategy selection */
export type ContextStrategy = { readonly getDefaults: () => ContextDefaults };

/** Loop shape configuration */
export interface LoopConfig {
  /** Principal: exit after one model invocation */
  readonly singleTurn?: boolean;
  /** Override budget turn limit */
  readonly maxTurns?: number;
}

/**
 * Strategy bundle produced by the harness factory.
 * All fields optional — when absent, the gateway falls back to current behavior.
 */
export interface HarnessStrategies {
  /** Composes system prompt from agent profile + personality + tools. */
  readonly promptFormatter?: PromptFormatter;
  /** Parses provider-specific model output into canonical ParsedModelOutput. */
  readonly responseParser?: ResponseParser;
  /** Per-profile context budget defaults and compaction strategy selection. */
  readonly contextStrategy?: ContextStrategy;
  /** Loop shape configuration. */
  readonly loopConfig?: LoopConfig;
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

  /** Composable harness strategies (WR-127). When present, the gateway
   *  delegates to these instead of built-in behavior. */
  harness?: HarnessStrategies;
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
