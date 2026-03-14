import { createHash, randomUUID } from 'node:crypto';
import type {
  PublicMcpAdmissionDecision,
  PublicMcpClientMetadata,
  PublicMcpExecutionRequest,
  PublicMcpHttpRequest,
  PublicMcpRejectReason,
  PublicMcpRpcRequest,
  PublicMcpScope,
  PublicMcpSubject,
  PublicMcpTokenClaims,
  PublicMcpToolMappingEntry,
} from '@nous/shared';
import {
  PublicMcpAdmissionDecisionSchema,
  PublicMcpHttpRequestSchema,
  PublicMcpNamespaceSchema,
  PublicMcpRpcRequestSchema,
  PublicMcpSubjectSchema,
  PublicMcpTokenClaimsSchema,
} from '@nous/shared';

export interface PublicMcpTokenVerifier {
  verifyBearer(token: string): Promise<PublicMcpTokenClaims>;
}

export interface PublicMcpAdmissionEvaluation {
  decision: PublicMcpAdmissionDecision;
  rpcRequest?: PublicMcpRpcRequest;
  requiredScopes: PublicMcpScope[];
  validatedAudience?: string;
  origin?: string;
  policyRef: string;
}

export interface PublicMcpAuthAdmissionOptions {
  expectedAudience: string;
  tokenVerifier?: PublicMcpTokenVerifier;
  clientMetadataResolver?: (clientId: string) => Promise<PublicMcpClientMetadata | null>;
  toolMappingLookup?: (externalName: string) => PublicMcpToolMappingEntry | null;
  requiredScopeResolver?: (
    toolName: string,
    args?: Record<string, unknown>,
  ) => PublicMcpScope[];
  now?: () => string;
  idFactory?: () => string;
}

export class DefaultPublicMcpTokenVerifier implements PublicMcpTokenVerifier {
  async verifyBearer(token: string): Promise<PublicMcpTokenClaims> {
    const payload = decodeTokenPayload(token);
    return PublicMcpTokenClaimsSchema.parse(payload);
  }
}

export class PublicMcpAuthAdmission {
  private readonly now: () => string;
  private readonly idFactory: () => string;
  private readonly tokenVerifier: PublicMcpTokenVerifier;
  private readonly policyRef = 'public-mcp.auth-admission.v1';

  constructor(private readonly options: PublicMcpAuthAdmissionOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.idFactory = options.idFactory ?? randomUUID;
    this.tokenVerifier = options.tokenVerifier ?? new DefaultPublicMcpTokenVerifier();
  }

  resolveRequiredScopes(
    toolName?: string,
    args?: Record<string, unknown>,
  ): PublicMcpScope[] {
    if (!toolName) {
      return [];
    }
    return this.options.requiredScopeResolver
      ? [...this.options.requiredScopeResolver(toolName, args)]
      : [...(this.options.toolMappingLookup?.(toolName)?.requiredScopes ?? [])];
  }

  async evaluate(
    request: PublicMcpHttpRequest,
  ): Promise<PublicMcpAdmissionEvaluation> {
    const parsedRequest = PublicMcpHttpRequestSchema.parse(request);
    const parsedRpc = PublicMcpRpcRequestSchema.safeParse(parsedRequest.body);
    if (!parsedRpc.success) {
      return this.reject(parsedRequest, 'request_schema_invalid');
    }

    const authHeader = getHeader(parsedRequest.headers, 'authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return this.reject(parsedRequest, 'missing_bearer', parsedRpc.data);
    }
    const bearerToken = authHeader.slice('Bearer '.length);

    let claims: PublicMcpTokenClaims;
    try {
      claims = await this.tokenVerifier.verifyBearer(bearerToken);
    } catch {
      return this.reject(parsedRequest, 'invalid_token', parsedRpc.data);
    }

    if (claims.revoked) {
      return this.reject(parsedRequest, 'invalid_token', parsedRpc.data);
    }

    if (claims.expiresAt && Date.parse(claims.expiresAt) <= Date.parse(this.now())) {
      return this.reject(parsedRequest, 'expired_token', parsedRpc.data);
    }

    if (claims.audience !== this.options.expectedAudience) {
      return this.reject(parsedRequest, 'audience_mismatch', parsedRpc.data);
    }

    const origin = parsedRequest.origin ?? getHeader(parsedRequest.headers, 'origin');
    const metadata = await this.resolveClientMetadata(claims.clientId);
    if (origin && !metadata) {
      return this.reject(parsedRequest, 'client_metadata_unresolved', parsedRpc.data);
    }
    if (origin && metadata?.allowedOrigins.length && !metadata.allowedOrigins.includes(origin)) {
      return this.reject(parsedRequest, 'origin_mismatch', parsedRpc.data);
    }

    const requiredScopes =
      parsedRpc.data.method === 'tools/call'
        ? this.resolveRequiredScopes(
            parsedRpc.data.params.name,
            parsedRpc.data.params.arguments,
          )
        : [];
    if (requiredScopes.length > 0 && !requiredScopes.every((scope) => claims.scopes.includes(scope))) {
      return this.reject(parsedRequest, 'scope_insufficient', parsedRpc.data);
    }

    const subject = this.buildSubject(
      claims,
      createHash('sha256').update(bearerToken).digest('hex'),
      origin ?? undefined,
    );
    const requestedNamespace = extractRequestedNamespace(parsedRpc.data);
    if (requestedNamespace) {
      const namespaceCheck = PublicMcpNamespaceSchema.safeParse(requestedNamespace);
      if (!namespaceCheck.success) {
        return this.reject(parsedRequest, 'namespace_invalid', parsedRpc.data);
      }
      if (namespaceCheck.data !== subject.namespace) {
        return this.reject(parsedRequest, 'namespace_unauthorized', parsedRpc.data);
      }
    }

    if (violatesSensitivityCeiling(parsedRpc.data)) {
      return this.reject(parsedRequest, 'sensitivity_ceiling_exceeded', parsedRpc.data);
    }

    return {
      decision: PublicMcpAdmissionDecisionSchema.parse({
        requestId: parsedRequest.requestId,
        outcome: 'admitted',
        httpStatus: 200,
        subject,
        witnessRefs: [],
        evaluatedAt: this.now(),
      }),
      rpcRequest: parsedRpc.data,
      requiredScopes,
      validatedAudience: claims.audience,
      origin: origin ?? undefined,
      policyRef: this.policyRef,
    };
  }

  normalizeExecutionRequest(
    rpcRequest: PublicMcpRpcRequest,
    subject: PublicMcpSubject,
    requestId: string,
    idempotencyKey?: string,
  ): PublicMcpExecutionRequest {
    return {
      requestId,
      jsonrpc: '2.0',
      rpcId: rpcRequest.id,
      protocolVersion:
        rpcRequest.method === 'initialize'
          ? (rpcRequest.params?.protocolVersion ?? '2025-11-25')
          : '2025-11-25',
      method: rpcRequest.method,
      toolName: rpcRequest.method === 'tools/call' ? rpcRequest.params.name : undefined,
      arguments:
        rpcRequest.method === 'tools/call'
          ? rpcRequest.params.arguments
          : rpcRequest.method === 'tasks/get' || rpcRequest.method === 'tasks/result'
            ? rpcRequest.params
            : undefined,
      subject,
      idempotencyKey,
      requestedAt: this.now(),
    };
  }

  private async resolveClientMetadata(
    clientId: string,
  ): Promise<PublicMcpClientMetadata | null> {
    return this.options.clientMetadataResolver?.(clientId) ?? null;
  }

  private buildSubject(
    claims: PublicMcpTokenClaims,
    tokenFingerprint: string,
    origin?: string,
  ): PublicMcpSubject {
    const clientIdHash = createHash('sha256').update(claims.clientId).digest('hex');
    const subspace = sanitizeSubspace(claims.subspace);
    const namespace = subspace
      ? `app:${clientIdHash}:${subspace}`
      : `app:${clientIdHash}`;

    return PublicMcpSubjectSchema.parse({
      class: 'ExternalClient',
      clientId: claims.clientId,
      clientIdHash,
      tokenFingerprint,
      namespace,
      scopes: claims.scopes,
      audience: claims.audience,
      origin,
      metadataDocumentUri: claims.metadataDocumentUri,
    });
  }

  private reject(
    request: PublicMcpHttpRequest,
    rejectReason: PublicMcpRejectReason,
    rpcRequest?: PublicMcpRpcRequest,
  ): PublicMcpAdmissionEvaluation {
    return {
      decision: PublicMcpAdmissionDecisionSchema.parse({
        requestId: request.requestId ?? this.idFactory(),
        outcome: 'rejected',
        httpStatus: rejectHttpStatus(rejectReason),
        rejectReason,
        witnessRefs: [],
        evaluatedAt: this.now(),
      }),
      rpcRequest,
      requiredScopes:
        rpcRequest?.method === 'tools/call'
          ? this.resolveRequiredScopes(rpcRequest.params.name, rpcRequest.params.arguments)
          : [],
      validatedAudience: this.options.expectedAudience,
      origin: request.origin ?? getHeader(request.headers, 'origin') ?? undefined,
      policyRef: this.policyRef,
    };
  }
}

function decodeTokenPayload(token: string): unknown {
  const payload = token.split('.').length === 3 ? token.split('.')[1]! : token;
  const json = Buffer.from(payload, 'base64url').toString('utf8');
  return JSON.parse(json);
}

function getHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];
}

function sanitizeSubspace(subspace?: string): string | undefined {
  if (!subspace) {
    return undefined;
  }
  return subspace.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64) || undefined;
}

function extractRequestedNamespace(
  rpcRequest: PublicMcpRpcRequest,
): string | undefined {
  if (rpcRequest.method !== 'tools/call') {
    return undefined;
  }

  const args = rpcRequest.params.arguments as Record<string, unknown>;
  const namespace = args.namespace;
  return typeof namespace === 'string' ? namespace : undefined;
}

function violatesSensitivityCeiling(rpcRequest: PublicMcpRpcRequest): boolean {
  if (rpcRequest.method !== 'tools/call') {
    return false;
  }

  const args = rpcRequest.params.arguments as Record<string, unknown>;
  const targetCollection = typeof args.targetCollection === 'string'
    ? args.targetCollection
    : undefined;
  const storageTier = typeof args.storageTier === 'string' ? args.storageTier : undefined;
  const sensitivityTier = typeof args.sensitivityTier === 'string'
    ? args.sensitivityTier
    : undefined;

  return (
    targetCollection?.startsWith('internal:') === true ||
    targetCollection?.startsWith('promoted:') === true ||
    targetCollection === 'memory_entries' ||
    targetCollection === 'stm_context' ||
    storageTier === 'internal' ||
    storageTier === 'promoted' ||
    (sensitivityTier !== undefined &&
      sensitivityTier !== 'external' &&
      sensitivityTier !== 'public')
  );
}

function rejectHttpStatus(reason: PublicMcpRejectReason): number {
  switch (reason) {
    case 'missing_bearer':
    case 'invalid_token':
    case 'expired_token':
    case 'audience_mismatch':
      return 401;
    case 'origin_mismatch':
    case 'scope_insufficient':
    case 'namespace_unauthorized':
    case 'sensitivity_ceiling_exceeded':
      return 403;
    case 'request_schema_invalid':
    case 'namespace_invalid':
    case 'client_metadata_unresolved':
      return 400;
    default:
      return 409;
  }
}
