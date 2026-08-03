import { z } from 'zod';
import type {
  CliExecutionCapabilityProfile,
  GatewayContextFrame,
  ILogChannel,
  ModelRequirements,
  ToolDefinition,
  TraceId,
} from '@nous/shared';
import type { ParsedModelOutput } from '../shared/output.js';
import type { ProviderAdapterKey } from './provider-definition.js';

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

export const AdapterCapabilitiesSchema = z.object({
  nativeToolUse: z.boolean(),
  cacheControl: z.boolean(),
  extendedThinking: z.boolean(),
  streaming: z.boolean(),
}).strict();

export const AdapterExecutionCapabilityProfileSchema = z.enum([
  'one_shot_command',
  'session_bound_command',
  'persistent_process',
]);

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

export interface ProviderAdapterCreateOptions {
  readonly modelId?: string;
  readonly log?: ILogChannel;
}

export interface ProviderAdapterModule {
  readonly adapterKey: ProviderAdapterKey;
  readonly displayName: string;
  readonly protocol: string;
  readonly capabilities: AdapterCapabilities;
  readonly executionCapabilityProfile?: CliExecutionCapabilityProfile;
  create(options?: ProviderAdapterCreateOptions): ProviderAdapter;
}

export const ProviderAdapterModuleSchema = z.object({
  adapterKey: z.string().min(1),
  displayName: z.string().min(1),
  protocol: z.string().min(1),
  capabilities: AdapterCapabilitiesSchema,
  executionCapabilityProfile: AdapterExecutionCapabilityProfileSchema.optional(),
  create: z.function(),
}).strict();

export function defineProviderAdapter<const T extends ProviderAdapterModule>(
  adapter: T,
): T {
  ProviderAdapterModuleSchema.parse(adapter);
  return adapter;
}
