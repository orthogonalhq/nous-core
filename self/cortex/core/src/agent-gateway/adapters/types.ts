/**
 * Provider adapter interface — stateless format translators.
 *
 * Two-stage pipeline:
 * 1. PromptFormatter (agent-type axis) → canonical PromptFormatterOutput
 * 2. ProviderAdapter.formatRequest (provider axis) → provider-specific request
 *
 * WR-127 Phase 1.1 — types only, no concrete implementations.
 */
import type {
  GatewayContextFrame,
  ModelRequirements,
  ToolDefinition,
  TraceId,
} from '@nous/shared';
import type { ParsedModelOutput } from '../../output-parser.js';

/**
 * Static capability manifest — declares what the provider/adapter supports.
 */
export interface AdapterCapabilities {
  /** Provider supports native tool-use in API body */
  readonly nativeToolUse: boolean;
  /** Provider supports cache control headers/segments */
  readonly cacheControl: boolean;
  /** Provider supports extended thinking / reasoning traces */
  readonly extendedThinking: boolean;
  /** Provider supports streaming responses */
  readonly streaming: boolean;
}

/**
 * Input to the adapter's request formatter.
 */
export interface AdapterFormatInput {
  /** System prompt — string or string[] (cache segments) from PromptFormatter */
  readonly systemPrompt: string | string[];
  /** Conversation context frames */
  readonly context: readonly GatewayContextFrame[];
  /** Tool definitions — when present, format for native tool-use if capable */
  readonly toolDefinitions?: readonly ToolDefinition[];
  /** Model requirements (max tokens, temperature, etc.) */
  readonly modelRequirements?: ModelRequirements;
}

/**
 * Provider-formatted request — ready to pass to IModelProvider.invoke().
 */
export interface AdapterFormattedRequest {
  /** The formatted input for the provider */
  readonly input: Record<string, unknown>;
  /** Any provider-specific options/headers */
  readonly options?: Record<string, unknown>;
}

/**
 * Provider adapter — stateless format translator.
 */
export interface ProviderAdapter {
  /** Static capability manifest */
  readonly capabilities: AdapterCapabilities;

  /**
   * Translates canonical prompt output into provider-specific request format.
   */
  formatRequest(input: AdapterFormatInput): AdapterFormattedRequest;

  /**
   * Parses provider-specific response into canonical ParsedModelOutput.
   * On parse failure: returns text-mode fallback. Does NOT throw.
   */
  parseResponse(output: unknown, traceId: TraceId): ParsedModelOutput;
}

/**
 * Adapter registry type — maps provider type string to adapter factory.
 */
export type AdapterRegistry = Record<string, () => ProviderAdapter>;
