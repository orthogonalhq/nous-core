import { z } from 'zod';

export const CredentialTypeSchema = z.enum([
  'api_key',
  'bearer_token',
  'basic_auth',
  'oauth2',
  'custom',
]);
export type CredentialType = z.infer<typeof CredentialTypeSchema>;

export const CredentialInjectionLocationSchema = z.enum([
  'header',
  'query',
  'body',
]);
export type CredentialInjectionLocation = z.infer<
  typeof CredentialInjectionLocationSchema
>;

export const CredentialRequestBodySchema = z.union([
  z.string(),
  z.record(z.unknown()),
  z.array(z.unknown()),
]);
export type CredentialRequestBody = z.infer<typeof CredentialRequestBodySchema>;

export const AppCredentialRequestDescriptorSchema = z.object({
  method: z.string().min(1).default('GET'),
  url: z.string().url(),
  headers: z.record(z.string()).default({}),
  body: CredentialRequestBodySchema.optional(),
});
export type AppCredentialRequestDescriptor = z.infer<
  typeof AppCredentialRequestDescriptorSchema
>;

export const AppCredentialKeySchema = z.object({
  app_id: z.string().min(1),
  user_key: z.string().min(1),
  vault_key: z.string().min(1),
});
export type AppCredentialKey = z.infer<typeof AppCredentialKeySchema>;

export const CredentialMetadataSchema = z.object({
  app_id: z.string().min(1),
  user_key: z.string().min(1),
  credential_ref: z.string().min(1),
  credential_type: CredentialTypeSchema,
  target_host: z.string().min(1),
  injection_location: CredentialInjectionLocationSchema,
  injection_key: z.string().min(1),
  expires_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
export type CredentialMetadata = z.infer<typeof CredentialMetadataSchema>;

export const CredentialVaultEntrySchema = CredentialMetadataSchema.extend({
  vault_key: z.string().min(1),
  encrypted_value: z.string().min(1),
  iv: z.string().min(1),
  auth_tag: z.string().min(1),
});
export type CredentialVaultEntry = z.infer<typeof CredentialVaultEntrySchema>;

export const CredentialStoreRequestSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  credential_type: CredentialTypeSchema,
  target_host: z.string().min(1),
  injection_location: CredentialInjectionLocationSchema,
  injection_key: z.string().min(1),
  expires_at: z.string().datetime().optional(),
});
export type CredentialStoreRequest = z.infer<typeof CredentialStoreRequestSchema>;

export const CredentialStoreResultSchema = z.object({
  credential_ref: z.string().min(1),
  metadata: CredentialMetadataSchema,
});
export type CredentialStoreResult = z.infer<typeof CredentialStoreResultSchema>;

export const CredentialInjectRequestSchema = z.object({
  key: z.string().min(1),
  request_descriptor: AppCredentialRequestDescriptorSchema,
});
export type CredentialInjectRequest = z.infer<typeof CredentialInjectRequestSchema>;

export const CredentialInjectedResponseSchema = z.object({
  status: z.number().int(),
  headers: z.record(z.string()).default({}),
  body: z.unknown().optional(),
  credential_ref: z.string().min(1),
  target_host: z.string().min(1),
  executed_at: z.string().datetime(),
});
export type CredentialInjectedResponse = z.infer<
  typeof CredentialInjectedResponseSchema
>;

export const CredentialRevokeRequestSchema = z.object({
  key: z.string().min(1),
  reason: z.string().min(1).optional(),
});
export type CredentialRevokeRequest = z.infer<typeof CredentialRevokeRequestSchema>;

export const CredentialRevokeResultSchema = z.object({
  revoked: z.boolean(),
  credential_ref: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
});
export type CredentialRevokeResult = z.infer<typeof CredentialRevokeResultSchema>;

export const CredentialNamespacePurgeResultSchema = z.object({
  app_id: z.string().min(1),
  purged_count: z.number().int().nonnegative(),
  purged_at: z.string().datetime(),
  witness_ref: z.string().min(1).optional(),
});
export type CredentialNamespacePurgeResult = z.infer<
  typeof CredentialNamespacePurgeResultSchema
>;

export const CredentialOAuthFlowRequestSchema = z.object({
  app_id: z.string().min(1),
  key: z.string().min(1),
  provider: z.string().min(1),
  scopes: z.array(z.string().min(1)).default([]),
  callbackPath: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).default({}),
  target_host: z.string().min(1),
  injection_location: CredentialInjectionLocationSchema,
  injection_key: z.string().min(1),
});
export type CredentialOAuthFlowRequest = z.infer<
  typeof CredentialOAuthFlowRequestSchema
>;

export const CredentialOAuthFlowResultSchema = z.object({
  status: z.enum(['success', 'cancelled', 'failed']),
  credentialRef: z.string().min(1).optional(),
  grantedScopes: z.array(z.string().min(1)).default([]),
  expiresAt: z.string().datetime().optional(),
  reason: z.string().min(1).optional(),
});
export type CredentialOAuthFlowResult = z.infer<
  typeof CredentialOAuthFlowResultSchema
>;

export const CredentialInstallSetupSchema = z.object({
  secrets: z.array(CredentialStoreRequestSchema).default([]),
  oauth: z.array(CredentialOAuthFlowRequestSchema).default([]),
});
export type CredentialInstallSetup = z.infer<typeof CredentialInstallSetupSchema>;
