import type {
  IDocumentStore,
  IPublicMcpDeploymentRouterService,
  IPublicMcpSurfaceService,
  IPublicMcpGatewayService,
  IWitnessService,
  PublicMcpAdmissionDecision,
  PublicMcpClientMetadata,
  PublicMcpDeploymentResolution,
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

export interface PublicMcpDeploymentBundle {
  executionBridge?: PublicMcpExecutionBridgeLike;
  surfaceService?: IPublicMcpSurfaceService;
}

export interface PublicMcpTunnelForwarderLike {
  forward(
    request: PublicMcpExecutionRequest,
    resolution: PublicMcpDeploymentResolution,
    targets: PublicMcpDeploymentBundle,
  ): Promise<PublicMcpExecutionResult>;
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
  requiredScopeResolver?: (
    toolName: string,
    args?: Record<string, unknown>,
  ) => PublicMcpScope[];
  deploymentRouter?: IPublicMcpDeploymentRouterService;
  deploymentBundleResolver?: (
    resolution: PublicMcpDeploymentResolution,
  ) => Promise<PublicMcpDeploymentBundle> | PublicMcpDeploymentBundle;
  tunnelForwarder?: PublicMcpTunnelForwarderLike;
  surfaceService?: IPublicMcpSurfaceService;
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
      requiredScopeResolver: options.requiredScopeResolver,
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
    let resolution: PublicMcpDeploymentResolution | undefined;
    if (request.method !== 'initialize' && request.method !== 'tools/list') {
      try {
        resolution = await this.resolveDeployment(request);
      } catch (error) {
        return this.finalizeExecution(
          request,
          PublicMcpExecutionResultSchema.parse({
            requestId: request.requestId,
            httpStatus: 404,
            rpcId: request.rpcId,
            rejectReason: 'deployment_not_resolved',
            error: {
              code: -32012,
              message: error instanceof Error ? error.message : 'Public MCP deployment could not be resolved.',
            },
          }),
          startedAt,
        );
      }
    }
    const bundle = resolution
      ? await this.resolveDeploymentBundle(resolution)
      : {
          executionBridge: this.options.executionBridge,
          surfaceService: this.options.surfaceService,
        };

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
              tasks: {},
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

    if (request.method === 'tasks/get') {
      return this.finalizeExecution(
        request,
        resolution?.mode === 'local_tunnel' && this.options.tunnelForwarder
          ? await this.options.tunnelForwarder.forward(request, resolution, bundle)
          : await this.executeTaskGet(request, bundle.surfaceService),
        startedAt,
        resolution,
      );
    }

    if (request.method === 'tasks/result') {
      return this.finalizeExecution(
        request,
        resolution?.mode === 'local_tunnel' && this.options.tunnelForwarder
          ? await this.options.tunnelForwarder.forward(request, resolution, bundle)
          : await this.executeTaskResult(request, bundle.surfaceService),
        startedAt,
        resolution,
      );
    }

    const bridgeResult =
      resolution?.mode === 'local_tunnel' && this.options.tunnelForwarder
        ? await this.options.tunnelForwarder.forward(request, resolution, bundle)
        : bundle.executionBridge
          ? await bundle.executionBridge.executeMappedTool(request)
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

    return this.finalizeExecution(request, bridgeResult, startedAt, resolution);
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
    resolution?: PublicMcpDeploymentResolution,
  ): Promise<PublicMcpExecutionResult> {
    const outcome = result.error ? 'blocked' : 'completed';
    const auditDetail = buildAuditDetail(request, result, resolution);
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
      ...auditDetail,
    };

    const authorizationEventId = await this.appendAuthorization(detail);
    const completionEventId = await this.appendCompletion(
      request.requestId,
      authorizationEventId,
      result.error ? 'blocked' : 'succeeded',
      detail,
    );

    const audit = await this.auditStore.save({
      requestId: request.requestId,
      timestamp: this.now(),
      oauthClientId: request.subject.clientId,
      namespace: request.subject.namespace,
      toolName: request.toolName,
      internalToolName: result.internalToolName,
      tier: auditDetail.tier,
      entryId: auditDetail.entryId,
      lifecycleAction: auditDetail.lifecycleAction,
      outcome,
      rejectReason: result.rejectReason,
      lifecycleState: auditDetail.lifecycleState,
      quotaDecision: auditDetail.quotaDecision,
      rateLimitDecision: auditDetail.rateLimitDecision,
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

  private async resolveDeployment(
    request: PublicMcpExecutionRequest,
  ): Promise<PublicMcpDeploymentResolution | undefined> {
    if (!this.options.deploymentRouter) {
      return undefined;
    }

    return this.options.deploymentRouter.resolve(request);
  }

  private async resolveDeploymentBundle(
    resolution: PublicMcpDeploymentResolution,
  ): Promise<PublicMcpDeploymentBundle> {
    const resolved = this.options.deploymentBundleResolver
      ? await this.options.deploymentBundleResolver(resolution)
      : {};
    return {
      executionBridge: resolved.executionBridge ?? this.options.executionBridge,
      surfaceService: resolved.surfaceService ?? this.options.surfaceService,
    };
  }

  private async executeTaskGet(
    request: PublicMcpExecutionRequest,
    surfaceService?: IPublicMcpSurfaceService,
  ): Promise<PublicMcpExecutionResult> {
    const task = await surfaceService?.getTask({
      requestId: request.requestId,
      subject: request.subject,
      taskId: String(request.arguments?.taskId ?? ''),
      requestedAt: request.requestedAt,
    });
    return PublicMcpExecutionResultSchema.parse({
      requestId: request.requestId,
      httpStatus: task ? 200 : 404,
      rpcId: request.rpcId,
      result: task ?? undefined,
      rejectReason: task ? undefined : 'task_not_found',
      error: task
        ? undefined
        : {
            code: -32010,
            message: 'Task not found.',
          },
    });
  }

  private async executeTaskResult(
    request: PublicMcpExecutionRequest,
    surfaceService?: IPublicMcpSurfaceService,
  ): Promise<PublicMcpExecutionResult> {
    const taskResult = await surfaceService?.getTaskResult({
      requestId: request.requestId,
      subject: request.subject,
      taskId: String(request.arguments?.taskId ?? ''),
      requestedAt: request.requestedAt,
    });
    return PublicMcpExecutionResultSchema.parse({
      requestId: request.requestId,
      httpStatus: taskResult ? 200 : 404,
      rpcId: request.rpcId,
      result: taskResult ?? undefined,
      rejectReason: taskResult ? undefined : 'task_not_ready',
      error: taskResult
        ? undefined
        : {
            code: -32011,
            message: 'Task result is not available.',
          },
    });
  }
}

function buildAuditDetail(
  request: PublicMcpExecutionRequest,
  result: PublicMcpExecutionResult,
  resolution?: PublicMcpDeploymentResolution,
): {
  tier?: 'stm' | 'ltm';
  entryId?: string;
  lifecycleAction?: 'quarantine' | 'purge';
  lifecycleState?: 'active' | 'quarantined' | 'purging' | 'purged';
  quotaDecision?: 'allow' | 'reject';
  rateLimitDecision?: 'allow' | 'reject';
  deployment?: PublicMcpDeploymentResolution;
} {
  const args =
    request.method === 'tools/call' && request.arguments
      ? (request.arguments as Record<string, unknown>)
      : {};
  const resultData = result.error?.data ?? {};
  const resultValue =
    result.result && typeof result.result === 'object'
      ? (result.result as Record<string, unknown>)
      : {};
  const entry =
    resultValue.entry && typeof resultValue.entry === 'object'
      ? (resultValue.entry as Record<string, unknown>)
      : {};

  const tier = pickTier(args, resultValue, entry, resultData);
  const lifecycleState = pickLifecycleState(resultData);

  return {
    tier,
    entryId: pickString(resultValue.entryId) ?? pickString(entry.id) ?? pickString(resultData.entryId),
    lifecycleAction: pickLifecycleAction(resultValue, resultData),
    lifecycleState,
    quotaDecision:
      result.rejectReason === 'quota_exceeded'
        ? 'reject'
        : request.method === 'tools/call'
          ? 'allow'
          : undefined,
    rateLimitDecision:
      result.rejectReason === 'rate_limited'
        ? 'reject'
        : request.method === 'tools/call'
          ? 'allow'
          : undefined,
    deployment: resolution,
  };
}

function pickTier(
  args: Record<string, unknown>,
  resultValue: Record<string, unknown>,
  entry: Record<string, unknown>,
  resultData: Record<string, unknown>,
): 'stm' | 'ltm' | undefined {
  const direct =
    pickMemoryTier(args.tier) ??
    pickMemoryTier(args.sourceTier) ??
    pickMemoryTier(entry.tier) ??
    pickMemoryTier(resultData.tier);
  if (direct) {
    return direct;
  }

  const strategy = pickString(args.strategy) ?? pickString(resultValue.strategy);
  if (strategy === 'summarize') {
    return 'stm';
  }
  if (strategy === 'extract_facts') {
    return 'ltm';
  }
  return undefined;
}

function pickLifecycleAction(
  resultValue: Record<string, unknown>,
  resultData: Record<string, unknown>,
): 'quarantine' | 'purge' | undefined {
  const value = pickString(resultValue.lifecycleAction) ?? pickString(resultData.lifecycleAction);
  return value === 'quarantine' || value === 'purge' ? value : undefined;
}

function pickLifecycleState(
  resultData: Record<string, unknown>,
): 'active' | 'quarantined' | 'purging' | 'purged' | undefined {
  const value = pickString(resultData.lifecycleState);
  return value === 'active' ||
    value === 'quarantined' ||
    value === 'purging' ||
    value === 'purged'
    ? value
    : undefined;
}

function pickMemoryTier(value: unknown): 'stm' | 'ltm' | undefined {
  return value === 'stm' || value === 'ltm' ? value : undefined;
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
