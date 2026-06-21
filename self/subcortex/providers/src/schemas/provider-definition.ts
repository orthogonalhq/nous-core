import { z } from 'zod';
import {
  ProviderClassSchema,
  ProviderIdSchema,
  ProviderTypeSchema,
  ProviderVendorSchema,
  CliExecutionCapabilityProfileSchema,
  type CliExecutionCapabilityProfile,
  type ProviderClass,
  type ProviderId,
  type ProviderType,
  type ProviderVendor,
} from '@nous/shared';

export const ProviderProtocolSchema = z.string().min(1);
export type ProviderProtocol =
  | 'agent-cli'
  | 'anthropic-messages'
  | 'chat-completions'
  | 'ollama'
  | (string & {});

export const ProviderAdapterKeySchema = z.string().min(1);
export type ProviderAdapterKey =
  | 'anthropic'
  | 'chat-completions'
  | 'ollama'
  | 'text'
  | (string & {});

export const ProviderCredentialPurposeSchema = z.literal('api_key');
export type ProviderCredentialPurpose = z.infer<typeof ProviderCredentialPurposeSchema>;

export const ProviderAuthHeaderSchemeSchema = z.enum(['raw', 'bearer']);
export type ProviderAuthHeaderScheme = z.infer<typeof ProviderAuthHeaderSchemeSchema>;

export const ProviderAuthHeaderDefinitionSchema = z.object({
  name: z.string().min(1),
  scheme: ProviderAuthHeaderSchemeSchema,
}).strict();

export interface ProviderAuthHeaderDefinition {
  name: string;
  scheme: ProviderAuthHeaderScheme;
}

export const ProviderAuthDefinitionSchema = z.object({
  envVar: z.string().min(1).optional(),
  vaultKeyNamespace: z.string().min(1).optional(),
  header: ProviderAuthHeaderDefinitionSchema.optional(),
  required: z.boolean(),
  purpose: ProviderCredentialPurposeSchema,
}).strict();

export interface ProviderAuthDefinition {
  envVar?: string;
  vaultKeyNamespace?: string;
  header?: ProviderAuthHeaderDefinition;
  required: boolean;
  purpose: ProviderCredentialPurpose;
}

export const ProviderCapabilityDefinitionSchema = z.object({
  streaming: z.boolean().optional(),
  cacheControl: z.boolean().optional(),
  extendedThinking: z.boolean().optional(),
  nativeToolUse: z.boolean().optional(),
  modelListing: z.boolean().optional(),
  healthCheck: z.boolean().optional(),
}).strict();

export interface ProviderCapabilityDefinition {
  streaming?: boolean;
  cacheControl?: boolean;
  extendedThinking?: boolean;
  nativeToolUse?: boolean;
  modelListing?: boolean;
  healthCheck?: boolean;
}

export const ProviderModelListFormatSchema = z.enum([
  'anthropic-models',
  'openai-models',
]);
export type ProviderModelListFormat = z.infer<typeof ProviderModelListFormatSchema>;

export const AgentCliAuthRequirementKindSchema = z.enum([
  'none',
  'api_key',
  'oauth',
  'local_session',
  'custom',
]);
export type AgentCliAuthRequirementKind = z.infer<typeof AgentCliAuthRequirementKindSchema>;

export const AgentCliTranscriptStreamSchema = z.enum(['stdout', 'stderr']);
export type AgentCliProviderTranscriptStream = z.infer<typeof AgentCliTranscriptStreamSchema>;

export const AgentCliTranscriptFormatSchema = z.enum(['text', 'json', 'mixed']);
export type AgentCliTranscriptFormat = z.infer<typeof AgentCliTranscriptFormatSchema>;

export const AgentCliProviderMetadataSchema = z.object({
  command: z.object({
    executable: z.string().min(1),
    defaultArgs: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  }).strict(),
  install: z.object({
    command: z.string().min(1),
    packageName: z.string().min(1).optional(),
    versionCommand: z.string().min(1).optional(),
    minimumVersion: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
  }).strict().optional(),
  auth: z.object({
    kind: AgentCliAuthRequirementKindSchema,
    description: z.string().min(1).optional(),
    envVar: z.string().min(1).optional(),
  }).strict(),
  headless: z.object({
    supported: z.boolean(),
    requiredArgs: z.array(z.string()).optional(),
    nonInteractiveEnv: z.record(z.string(), z.string()).optional(),
  }).strict(),
  transcript: z.object({
    supported: z.boolean(),
    streams: z.array(AgentCliTranscriptStreamSchema),
    format: AgentCliTranscriptFormatSchema.optional(),
  }).strict(),
  timeout: z.object({
    defaultMs: z.number().int().positive(),
    maxMs: z.number().int().positive().optional(),
  }).strict(),
  failureBehavior: z.object({
    timeoutKind: z.literal('timeout'),
    nonZeroExitKind: z.literal('non_zero_exit'),
    spawnErrorKind: z.literal('spawn_error'),
  }).strict().optional(),
  caveats: z.array(z.string().min(1)).optional(),
  targetIssueRefs: z.array(z.string().min(1)).optional(),
}).strict();

export type AgentCliProviderMetadata = z.infer<typeof AgentCliProviderMetadataSchema>;

export const ProviderDefinitionSchema = z.object({
  vendorKey: ProviderVendorSchema,
  displayName: z.string().min(1),
  wellKnownProviderId: ProviderIdSchema,
  providerType: ProviderTypeSchema,
  providerClass: ProviderClassSchema,
  protocol: ProviderProtocolSchema,
  adapterKey: ProviderAdapterKeySchema,
  defaultEndpoint: z.string().url(),
  defaultModelId: z.string().min(1),
  auth: ProviderAuthDefinitionSchema,
  isLocal: z.boolean(),
  headers: z.record(z.string(), z.string()).optional(),
  modelListEndpoint: z.string().min(1).optional(),
  modelListFormat: ProviderModelListFormatSchema.optional(),
  healthCheckEndpoint: z.string().min(1).optional(),
  capabilities: ProviderCapabilityDefinitionSchema.optional(),
  executionCapabilityProfile: CliExecutionCapabilityProfileSchema.optional(),
  agentCli: AgentCliProviderMetadataSchema.optional(),
}).strict();

export interface ProviderDefinition {
  vendorKey: ProviderVendor;
  displayName: string;
  wellKnownProviderId: ProviderId;
  providerType: ProviderType;
  providerClass: ProviderClass;
  protocol: ProviderProtocol;
  adapterKey: ProviderAdapterKey;
  defaultEndpoint: string;
  defaultModelId: string;
  auth: ProviderAuthDefinition;
  isLocal: boolean;
  headers?: Record<string, string>;
  modelListEndpoint?: string;
  modelListFormat?: ProviderModelListFormat;
  healthCheckEndpoint?: string;
  capabilities?: ProviderCapabilityDefinition;
  executionCapabilityProfile?: CliExecutionCapabilityProfile;
  agentCli?: AgentCliProviderMetadata;
}

export type ProviderDefinitionLeaf = Omit<ProviderDefinition, 'wellKnownProviderId'> & {
  wellKnownProviderId?: ProviderId;
};

export type ProviderDefinitionInput = Omit<ProviderDefinitionLeaf, 'vendorKey'> & {
  vendorKey: string;
};

export function defineProvider<const T extends ProviderDefinitionInput>(definition: T): T {
  ProviderDefinitionSchema.parse(definition);
  return definition;
}
