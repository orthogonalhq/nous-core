import { z } from 'zod';
import {
  ProviderClassSchema,
  ProviderIdSchema,
  ProviderTypeSchema,
  ProviderVendorSchema,
  type ProviderClass,
  type ProviderId,
  type ProviderType,
  type ProviderVendor,
} from '@nous/shared';

export const ProviderProtocolSchema = z.string().min(1);
export type ProviderProtocol =
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

export const ProviderAuthDefinitionSchema = z.object({
  envVar: z.string().min(1).optional(),
  vaultKeyNamespace: z.string().min(1).optional(),
  required: z.boolean(),
  purpose: ProviderCredentialPurposeSchema,
}).strict();

export interface ProviderAuthDefinition {
  envVar?: string;
  vaultKeyNamespace?: string;
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
  healthCheckEndpoint: z.string().min(1).optional(),
  capabilities: ProviderCapabilityDefinitionSchema.optional(),
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
  healthCheckEndpoint?: string;
  capabilities?: ProviderCapabilityDefinition;
}

export type ProviderDefinitionInput = Omit<ProviderDefinition, 'vendorKey'> & {
  vendorKey: string;
};

export function defineProvider<const T extends ProviderDefinitionInput>(definition: T): T {
  ProviderDefinitionSchema.parse(definition);
  return definition;
}
