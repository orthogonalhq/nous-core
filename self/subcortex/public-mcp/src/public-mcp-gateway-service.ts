import type {
  IDocumentStore,
  IPublicMcpGatewayService,
  IWitnessService,
  PublicMcpAdmissionDecision,
  PublicMcpClientMetadata,
  PublicMcpDiscoveryBundle,
  PublicMcpExecutionRequest,
  PublicMcpExecutionResult,
  PublicMcpHttpRequest,
  PublicMcpRejectReason,
  PublicMcpScope,
  PublicMcpSubject,
  PublicMcpToolDefinition,
  PublicMcpToolMappingEntry,
} from '@nous/shared';
import {
  PublicMcpExecutionResultSchema,
  PublicMcpHttpRequestSchema,
} from '@nous/shared';
import { AuditProjectionStore } from './audit-projection-store.js';
import { PublicMcpAuthAdmission, type PublicMcpTokenVerifier } from './auth-admission.js';
import { buildPublicMcpDiscoveryDocuments } from './discovery-documents.js';
import { NamespaceRegistryStore } from './namespace-registry-store.js';

export interface PublicMcpExecutionBridgeLike {
  listTools(subject: PublicMcpSubject): Promise<PublicMcpToolDefinition[]>;
  executeMappedTool(request: PublicMcpExecutionRequest): Promise<PublicMcpExecutionResult>;
}

export interface PublicMcpGatewayServiceOptions {
  documentStore?: IDocumentStore;
  namespaceStore?: NamespaceRegistryStore;
  auditStore?: AuditProjectionStore;
  witnessService?: IWitnessService;
  executionBridge?: PublicMcpExecutionBridgeLike;
  baseUrl?: string;
  resource?: string;
  issuer?: string;
  tokenEndpoint?: string;
  jwksUri?: string;
  supportedScopes?: readonly PublicMcpScope[];
  expectedAudience?: string;
  tokenVerifier?: PublicMcpTokenVerifier;
  clientMetadataResolver?: (clientId: string) => Promise<PublicMcpClientMetadata | null>;
  toolMappingLookup?: (externalName: string) => PublicMcpToolMappingEntry | null;
  now?: () => string;
}

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_AUDIENCE = 'urn:nous:ortho:mcp';

export class PublicMcpGatewayService implements IPublicMcpGatewayService {
  private readonly namespaceStore: NamespaceRegistryStore;
  private readonly auditStore: AuditProjectionStore;
  private readonly authAdmission: PublicMcpAuthAdmission;
  private readonly now: () => string;

  constructor(private readonly options: PublicMcpGatewayServiceOptions) {
    if (!options.namespaceStore && !options.auditStore && !options.documentStore) {
      throw new Error(
        'PublicMcpGatewayService requires documentStore or concrete stores',
      );
    }

    this.now = options.now ?? (() => new Date().toISOString());
    this.namespaceStore =
      options.namespaceStore ?? new NamespaceRegistryStore(options.documentStore!, {
        now: this.now,
      });
    this.auditStore =
      options.auditStore ?? new AuditProjectionStore(options.documentStore!);
    this.authAdmission = new PublicMcpAuthAdmission({
      expectedAudience: options.expectedAudience ?? DEFAULT_AUDIENCE,
      tokenVerifier: options.tokenVerifier,
      clientMetadataResolver: options.clientMetadataResolver,
      toolMappingLookup: options.toolMappingLookup,
      now: this.now,
    });
  }

  async getDiscoveryDocuments(): Promise<PublicMcpDiscoveryBundle> {
    return buildPublicMcpDiscoveryDocuments({
      baseUrl: this.options.baseUrl ?? DEFAULT_BASE_URL,
      resource: this.options.resource ?? DEFAULT_AUDIENCE,
      issuer: this.options.issuer,
      tokenEndpoint: this.options.tokenEndpoint,
      jwksUri: this.options.jwksUri,
      scopes: this.options.supportedScopes,
    });
  }

  async authorize(
    request: PublicMcpHttpRequest,
  ): Promise<PublicMcpAdmissionDecision> {
    const parsedRequest = PublicMcpHttpRequestSchema.parse(request);
    const evaluation = await this.authAdmission.evaluate(parsedRequest);
    if (evaluation.decision.outcome !== 'rejected') {
      return evaluation.decision;
    }

    const witnessRefs = await this.recordWitnessForReject(
      parsedRequest.requestId,
      evaluation.decision.rejectReason!,
      evaluation.rpcRequest?.method,
      evaluation.rpcRequest?.method === 'tools/call'
        ? evaluation.rpcRequest.params.name
        : undefined,
      evaluation.requiredScopes,
      evaluation.validatedAudience,
      evaluation.origin,
    );

    await this.auditStore.save({
      requestId: parsedRequest.requestId,
      timestamp: this.now(),
      oauthClientId: 'unknown',
      outcome: 'rejected',
      rejectReason: evaluation.decision.rejectReason!,
      latencyMs: 0,
      authorizationEventId: witnessRefs[0] as any,
      completionEventId: witnessRefs[1] as any,
      createdAt: this.now(),
    });

    return {
      ...evaluation.decision,
      witnessRefs: witnessRefs as any,
    };
  }

  async listVisibleTools(
    subject: PublicMcpSubject,
  ): Promise<PublicMcpToolDefinition[]> {
    return this.options.executionBridge?.listTools(subject) ?? [];
  }

  async execute(
    request: PublicMcpExecutionRequest,
  ): Promise<PublicMcpExecutionResult> {
    const startedAt = Date.now();

    if (request.method === 'initialize') {
      return this.finalizeExecution(
        request,
        {
          requestId: request.requestId,
          httpStatus: 200,
          rpcId: request.rpcId,
          result: {
            protocolVersion: request.protocolVersion,
            serverInfo: {
              name: 'Nous Public MCP',
              version: '0.0.1',
            },
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
          },
        },
        startedAt,
      );
    }

    if (request.method === 'tools/list') {
      const tools = await this.listVisibleTools(request.subject);
      return this.finalizeExecution(
        request,
        {
          requestId: request.requestId,
          httpStatus: 200,
          rpcId: request.rpcId,
          result: { tools },
        },
        startedAt,
      );
    }

    const bridgeResult = this.options.executionBridge
      ? await this.options.executionBridge.executeMappedTool(request)
      : PublicMcpExecutionResultSchema.parse({
          requestId: request.requestId,
          httpStatus: 404,
          rpcId: request.rpcId,
          rejectReason: 'tool_not_available',
          error: {
            code: -32601,
            message: 'Tool not available.',
          },
        });

    return this.finalizeExecution(request, bridgeResult, startedAt);
  }

  getNamespaceStore(): NamespaceRegistryStore {
    return this.namespaceStore;
  }

  getAuditStore(): AuditProjectionStore {
    return this.auditStore;
  }

  private async finalizeExecution(
    request: PublicMcpExecutionRequest,
    result: PublicMcpExecutionResult,
    startedAtMs: number,
  ): Promise<PublicMcpExecutionResult> {
    const outcome = result.error ? 'blocked' : 'admitted';
    const detail = {
      ...this.buildWitnessDetail(
        request.requestId,
        request.subject.clientId,
        request.subject.namespace,
        this.authAdmission.resolveRequiredScopes(request.toolName),
        request.subject.audience,
        request.subject.origin,
      ),
      method: request.method,
      toolName: request.toolName,
      internalToolName: result.internalToolName,
      rejectReason: result.rejectReason,
    };

    const authorizationEventId = await this.appendAuthorization(detail);
    const completionEventId = await this.appendCompletion(
      request.requestId,
      authorizationEventId,
      outcome === 'admitted' ? 'succeeded' : 'blocked',
      detail,
    );

    const audit = await this.auditStore.save({
      requestId: request.requestId,
      timestamp: this.now(),
      oauthClientId: request.subject.clientId,
      namespace: request.subject.namespace,
      toolName: request.toolName,
      internalToolName: result.internalToolName,
      outcome,
      rejectReason: result.rejectReason,
      latencyMs: Math.max(0, Date.now() - startedAtMs),
      idempotencyKey: request.idempotencyKey,
      authorizationEventId: authorizationEventId as any,
      completionEventId: completionEventId as any,
      createdAt: this.now(),
    });

    return PublicMcpExecutionResultSchema.parse({
      ...result,
      authorizationEventId,
      completionEventId,
      auditRecordId: audit.requestId,
    });
  }

  private async recordWitnessForReject(
    requestId: string,
    rejectReason: PublicMcpRejectReason,
    method?: string,
    toolName?: string,
    requiredScopes: readonly PublicMcpScope[] = [],
    validatedAudience?: string,
    origin?: string,
  ) {
    const detail = {
      ...this.buildWitnessDetail(
        requestId,
        'unknown',
        undefined,
        requiredScopes,
        validatedAudience,
        origin,
      ),
      method,
      toolName,
      rejectReason,
    };
    const authorizationEventId = await this.appendAuthorization(
      detail,
      'denied',
      requestId,
    );
    const completionEventId = await this.appendCompletion(
      requestId,
      authorizationEventId,
      'blocked',
      detail,
    );

    return [authorizationEventId, completionEventId].filter(
      (value): value is string => Boolean(value),
    );
  }

  private buildWitnessDetail(
    requestId: string,
    subjectActorId: string,
    namespace: string | undefined,
    requiredScopes: readonly PublicMcpScope[],
    validatedAudience?: string,
    origin?: string,
  ) {
    return {
      subjectActorType: 'external_client',
      subjectActorId,
      namespace,
      policyRef: 'public-mcp.auth-admission.v1',
      requiredScopes,
      validatedAudience,
      origin,
      requestId,
    };
  }

  private async appendAuthorization(
    detail: Record<string, unknown>,
    status: 'approved' | 'denied' = 'approved',
    requestId?: string,
  ): Promise<string | undefined> {
    if (!this.options.witnessService) {
      return undefined;
    }

    const event = await this.options.witnessService.appendAuthorization({
      actionCategory: 'tool-execute',
      actionRef: `public-mcp:${requestId ?? String(detail.requestId)}`,
      actor: 'subcortex',
      status,
      detail,
    });
    return event.id;
  }

  private async appendCompletion(
    requestId: string,
    authorizationRef: string | undefined,
    status: 'succeeded' | 'blocked',
    detail: Record<string, unknown>,
  ): Promise<string | undefined> {
    if (!this.options.witnessService || !authorizationRef) {
      return undefined;
    }

    const event = await this.options.witnessService.appendCompletion({
      actionCategory: 'tool-execute',
      actionRef: `public-mcp:${requestId}`,
      authorizationRef: authorizationRef as any,
      actor: 'subcortex',
      status,
      detail,
    });
    return event.id;
  }
}
