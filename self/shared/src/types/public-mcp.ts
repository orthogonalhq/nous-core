import { z } from 'zod';
import { ToolDefinitionSchema } from './tools.js';
import { WitnessEventIdSchema } from './ids.js';

export const PublicMcpScopeSchema = z.enum([
  'ortho.memory.stm.read',
  'ortho.memory.stm.write',
  'ortho.memory.stm.delete',
  'ortho.memory.ltm.read',
  'ortho.memory.ltm.write',
  'ortho.memory.ltm.delete',
  'ortho.agents.invoke',
  'ortho.system.read',
  'ortho.admin',
]);
export type PublicMcpScope = z.infer<typeof PublicMcpScopeSchema>;

export const PublicMcpNamespaceSchema = z
  .string()
  .regex(/^app:[a-f0-9]{64}(?::[A-Za-z0-9._-]+)?$/);
export type PublicMcpNamespace = z.infer<typeof PublicMcpNamespaceSchema>;

export const PublicMcpRejectReasonSchema = z.enum([
  'missing_bearer',
  'invalid_token',
  'expired_token',
  'audience_mismatch',
  'origin_mismatch',
  'scope_insufficient',
  'client_metadata_unresolved',
  'namespace_invalid',
  'namespace_unauthorized',
  'request_schema_invalid',
  'sensitivity_ceiling_exceeded',
  'tool_not_available',
  'phase_not_enabled',
  'bootstrap_blocked',
]);
export type PublicMcpRejectReason = z.infer<typeof PublicMcpRejectReasonSchema>;

export const PublicMcpProtocolVersionSchema = z.literal('2025-11-25');
export type PublicMcpProtocolVersion = z.infer<typeof PublicMcpProtocolVersionSchema>;

export const PublicMcpMethodSchema = z.enum([
  'initialize',
  'tools/list',
  'tools/call',
]);
export type PublicMcpMethod = z.infer<typeof PublicMcpMethodSchema>;

export const PublicMcpRpcIdSchema = z.union([z.string().min(1), z.number(), z.null()]);
export type PublicMcpRpcId = z.infer<typeof PublicMcpRpcIdSchema>;

export const PublicMcpClientMetadataSchema = z.object({
  clientId: z.string().min(1),
  allowedOrigins: z.array(z.string().url()).default([]),
  metadataDocumentUri: z.string().url().optional(),
}).strict();
export type PublicMcpClientMetadata = z.infer<typeof PublicMcpClientMetadataSchema>;

export const PublicMcpTokenClaimsSchema = z.object({
  clientId: z.string().min(1),
  audience: z.string().min(1),
  scopes: z.array(PublicMcpScopeSchema).default([]),
  expiresAt: z.string().datetime().optional(),
  origin: z.string().url().optional(),
  metadataDocumentUri: z.string().url().optional(),
  subspace: z.string().min(1).optional(),
  revoked: z.boolean().optional(),
}).strict();
export type PublicMcpTokenClaims = z.infer<typeof PublicMcpTokenClaimsSchema>;

export const PublicMcpSubjectSchema = z.object({
  class: z.literal('ExternalClient'),
  clientId: z.string().min(1),
  clientIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  namespace: PublicMcpNamespaceSchema,
  scopes: z.array(PublicMcpScopeSchema),
  audience: z.string().min(1),
  origin: z.string().url().optional(),
  metadataDocumentUri: z.string().url().optional(),
}).strict();
export type PublicMcpSubject = z.infer<typeof PublicMcpSubjectSchema>;

export const PublicMcpToolDefinitionSchema = ToolDefinitionSchema.extend({
  name: z.string().regex(/^ortho\.[a-z0-9.]+$/),
  permissionScope: z.literal('external'),
}).strict();
export type PublicMcpToolDefinition = z.infer<typeof PublicMcpToolDefinitionSchema>;

export const PublicMcpToolMappingEntrySchema = z.object({
  externalName: z.string().regex(/^ortho\.[a-z0-9.]+$/),
  internalName: z.string().regex(/^[a-z0-9_]+$/),
  requiredScopes: z.array(PublicMcpScopeSchema).min(1),
  phaseAvailability: z.enum(['13.1', '13.2', '13.3']),
  enabledInCurrentPhase: z.boolean(),
  bootstrapMode: z.enum(['none', 'first_write']).default('none'),
}).strict();
export type PublicMcpToolMappingEntry = z.infer<typeof PublicMcpToolMappingEntrySchema>;

export const PublicMcpNamespaceRecordSchema = z.object({
  namespace: PublicMcpNamespaceSchema,
  clientId: z.string().min(1),
  clientIdHash: z.string().regex(/^[a-f0-9]{64}$/),
  subspace: z.string().min(1).optional(),
  stmCollection: z.string().min(1),
  ltmCollection: z.string().min(1),
  mutationAuditCollection: z.string().min(1),
  tombstoneCollection: z.string().min(1),
  vectorCollection: z.string().min(1),
  bootstrapState: z.enum(['reserved', 'ready', 'blocked']),
  createdAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
}).strict();
export type PublicMcpNamespaceRecord = z.infer<typeof PublicMcpNamespaceRecordSchema>;

export const PublicMcpAuditRecordSchema = z.object({
  requestId: z.string().uuid(),
  timestamp: z.string().datetime(),
  oauthClientId: z.string().min(1),
  namespace: PublicMcpNamespaceSchema.optional(),
  toolName: z.string().min(1).optional(),
  internalToolName: z.string().min(1).optional(),
  outcome: z.enum(['admitted', 'rejected', 'blocked']),
  rejectReason: PublicMcpRejectReasonSchema.optional(),
  latencyMs: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).optional(),
  authorizationEventId: WitnessEventIdSchema.optional(),
  completionEventId: WitnessEventIdSchema.optional(),
  createdAt: z.string().datetime(),
}).strict();
export type PublicMcpAuditRecord = z.infer<typeof PublicMcpAuditRecordSchema>;

export const PublicMcpInitializeParamsSchema = z.object({
  protocolVersion: PublicMcpProtocolVersionSchema.optional(),
  capabilities: z.record(z.unknown()).optional(),
  clientInfo: z.object({
    name: z.string().min(1),
    version: z.string().min(1).optional(),
  }).passthrough().optional(),
}).passthrough();
export type PublicMcpInitializeParams = z.infer<typeof PublicMcpInitializeParamsSchema>;

export const PublicMcpToolsListParamsSchema = z.object({}).passthrough();
export type PublicMcpToolsListParams = z.infer<typeof PublicMcpToolsListParamsSchema>;

export const PublicMcpToolCallParamsSchema = z.object({
  name: z.string().regex(/^ortho\.[a-z0-9.]+$/),
  arguments: z.record(z.unknown()).default({}),
}).passthrough();
export type PublicMcpToolCallParams = z.infer<typeof PublicMcpToolCallParamsSchema>;

export const PublicMcpRpcRequestSchema = z.discriminatedUnion('method', [
  z.object({
    jsonrpc: z.literal('2.0'),
    id: PublicMcpRpcIdSchema.optional(),
    method: z.literal('initialize'),
    params: PublicMcpInitializeParamsSchema.optional(),
  }).strict(),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: PublicMcpRpcIdSchema.optional(),
    method: z.literal('tools/list'),
    params: PublicMcpToolsListParamsSchema.optional(),
  }).strict(),
  z.object({
    jsonrpc: z.literal('2.0'),
    id: PublicMcpRpcIdSchema.optional(),
    method: z.literal('tools/call'),
    params: PublicMcpToolCallParamsSchema,
  }).strict(),
]);
export type PublicMcpRpcRequest = z.infer<typeof PublicMcpRpcRequestSchema>;

export const PublicMcpHttpRequestSchema = z.object({
  requestId: z.string().uuid(),
  method: z.enum(['GET', 'POST']),
  url: z.string().min(1),
  headers: z.record(z.string()),
  body: z.unknown().optional(),
  origin: z.string().url().optional(),
}).strict();
export type PublicMcpHttpRequest = z.infer<typeof PublicMcpHttpRequestSchema>;

export const PublicMcpProtectedResourceMetadataSchema = z.object({
  resource: z.string().min(1),
  authorization_servers: z.array(z.string().url()).min(1),
  bearer_methods_supported: z.array(z.string()).default(['header']),
  resource_documentation: z.string().url().optional(),
}).strict();
export type PublicMcpProtectedResourceMetadata = z.infer<
  typeof PublicMcpProtectedResourceMetadataSchema
>;

export const PublicMcpAuthorizationServerMetadataSchema = z.object({
  issuer: z.string().url(),
  token_endpoint: z.string().url().optional(),
  jwks_uri: z.string().url().optional(),
  response_types_supported: z.array(z.string()).default(['token']),
  grant_types_supported: z.array(z.string()).default(['client_credentials']),
  scopes_supported: z.array(PublicMcpScopeSchema).default([]),
}).strict();
export type PublicMcpAuthorizationServerMetadata = z.infer<
  typeof PublicMcpAuthorizationServerMetadataSchema
>;

export const PublicMcpDiscoveryBundleSchema = z.object({
  protectedResourceMetadata: PublicMcpProtectedResourceMetadataSchema,
  authorizationServerMetadata: PublicMcpAuthorizationServerMetadataSchema,
}).strict();
export type PublicMcpDiscoveryBundle = z.infer<typeof PublicMcpDiscoveryBundleSchema>;

export const PublicMcpAdmissionDecisionSchema = z.object({
  requestId: z.string().uuid(),
  outcome: z.enum(['admitted', 'rejected', 'discovery']),
  httpStatus: z.number().int().min(100).max(599),
  rejectReason: PublicMcpRejectReasonSchema.optional(),
  subject: PublicMcpSubjectSchema.optional(),
  witnessRefs: z.array(WitnessEventIdSchema).default([]),
  evaluatedAt: z.string().datetime(),
}).strict();
export type PublicMcpAdmissionDecision = z.infer<typeof PublicMcpAdmissionDecisionSchema>;

export const PublicMcpExecutionRequestSchema = z.object({
  requestId: z.string().uuid(),
  jsonrpc: z.literal('2.0'),
  rpcId: PublicMcpRpcIdSchema.optional(),
  protocolVersion: PublicMcpProtocolVersionSchema,
  method: PublicMcpMethodSchema,
  toolName: z.string().regex(/^ortho\.[a-z0-9.]+$/).optional(),
  arguments: z.record(z.unknown()).optional(),
  subject: PublicMcpSubjectSchema,
  idempotencyKey: z.string().min(1).optional(),
  requestedAt: z.string().datetime(),
}).strict();
export type PublicMcpExecutionRequest = z.infer<typeof PublicMcpExecutionRequestSchema>;

export const PublicMcpExecutionErrorSchema = z.object({
  code: z.number().int(),
  message: z.string().min(1),
  data: z.record(z.unknown()).optional(),
}).strict();
export type PublicMcpExecutionError = z.infer<typeof PublicMcpExecutionErrorSchema>;

export const PublicMcpExecutionResultSchema = z.object({
  requestId: z.string().uuid(),
  httpStatus: z.number().int().min(100).max(599),
  rpcId: PublicMcpRpcIdSchema.optional(),
  result: z.unknown().optional(),
  error: PublicMcpExecutionErrorSchema.optional(),
  rejectReason: PublicMcpRejectReasonSchema.optional(),
  internalToolName: z.string().min(1).optional(),
  authorizationEventId: WitnessEventIdSchema.optional(),
  completionEventId: WitnessEventIdSchema.optional(),
  auditRecordId: z.string().min(1).optional(),
}).strict();
export type PublicMcpExecutionResult = z.infer<typeof PublicMcpExecutionResultSchema>;
