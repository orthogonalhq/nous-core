/**
 * Shared Bootstrap — platform-agnostic Nous service graph instantiation.
 *
 * Extracted from `self/apps/web/server/bootstrap.ts`. Both the web app
 * (Next.js) and the desktop app (bare HTTP child process) call these
 * functions to wire the identical service graph.
 */
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_STM_COMPACTION_POLICY,
  PublicMcpHostedTenantBindingRecordSchema,
  PublicMcpScopeSchema,
  PublicMcpTunnelSessionRecordSchema,
  StmCompactionPolicySchema,
} from '@nous/shared';
import type {
  ProjectId,
  ProviderId,
  TraceId,
  StmCompactionPolicy,
} from '@nous/shared';
import { ConfigManager } from '@nous/autonomic-config';
import {
  AppCredentialInstallService,
  CredentialInjector,
  CredentialOAuthBroker,
  CredentialVaultService,
} from '@nous/autonomic-credentials';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
import { NodeRuntime } from '@nous/autonomic-runtime';
import { SqliteDocumentStore, SqliteVectorStore } from '@nous/autonomic-storage';
import { DocumentStmStore } from '@nous/memory-stm';
import { MwcPipeline } from '@nous/memory-mwc';
import {
  DocumentProjectTaxonomyMapping,
  DocumentRelationshipGraphStore,
  KnowledgeIndexRuntime,
  MetaVectorStore,
} from '@nous/memory-knowledge-index';
import {
  PfcEngine,
  createPfcEvaluator,
  createPfcMutationEvaluator,
} from '@nous/cortex-pfc';
import {
  DefaultSchemaRefValidator,
  GatewayBackedTurnExecutor,
  GatewayRuntimeIngressAdapter,
  PublicMcpExecutionBridge,
  PublicMcpRuntimeAdapter,
  createCapabilityHandlers,
  getPublicToolMapping,
  registerDynamicInternalMcpTool,
  resolvePublicMcpRequiredScopes,
  unregisterDynamicInternalMcpTool,
  createGatewayProjectApi,
  createPrincipalSystemGatewayRuntime,
} from '@nous/cortex-core';
import {
  AppInstallService,
  AppSettingsService,
  DocumentAppConfigStore,
  DocumentProjectStore,
  PackageInstallService,
  PackageLifecycleOrchestrator,
} from '@nous/subcortex-projects';
import { DocumentArtifactStore } from '@nous/subcortex-artifacts';
import { DocumentEscalationStore, EscalationService } from '@nous/subcortex-escalation';
import { ModelRouter } from '@nous/subcortex-router';
import { ProviderRegistry } from '@nous/subcortex-providers';
import {
  DiscoverProjectsTool,
  EchoTool,
  RefreshProjectKnowledgeTool,
  ToolExecutor,
} from '@nous/subcortex-tools';
import { DocumentScheduleStore, SchedulerService } from '@nous/subcortex-scheduler';
import { DeterministicWorkflowEngine } from '@nous/subcortex-workflows';
import { WitnessService } from '@nous/subcortex-witnessd';
import { DocumentRegistryStore, RegistryService } from '@nous/subcortex-registry';
import { DocumentNudgeStore, NudgeDiscoveryService } from '@nous/subcortex-nudges';
import { CommunicationGatewayService } from '@nous/subcortex-communication-gateway';
import { EndpointTrustService } from '@nous/subcortex-endpoint-trust';
import {
  OpctlService,
  InMemoryReplayStore,
  InMemoryStartLockStore,
  InMemoryScopeLockStore,
  InMemoryProjectControlStateStore,
} from '@nous/subcortex-opctl';
import { MaoProjectionService } from '@nous/subcortex-mao';
import { GtmGateCalculator } from '@nous/subcortex-gtm';
import { VoiceControlService } from '@nous/subcortex-voice-control';
import {
  AppRuntimeService,
  type AppToolRegistrar,
  AppToolRegistry,
  PanelTranspiler,
} from '@nous/subcortex-apps';
import {
  AuditProjectionStore,
  DeploymentRouterService,
  ExternalSourceMemoryService,
  ExternalSourceStorageAdapter,
  HostedTenantBindingStore,
  HostedTenantRuntimeFactory,
  NamespaceRegistryStore,
  PromotedMemoryBridgeService,
  PublicMcpGatewayService,
  type PublicMcpRuntimeAgentDefinition,
  PublicMcpSurfaceService,
  PublicMcpTaskProjectionStore,
  QuotaUsageStore,
  RateLimitBucketStore,
  TunnelForwarder,
  TunnelSessionStore,
} from '@nous/subcortex-public-mcp';
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import type { NousContext } from './context';
import type { IDocumentStore, IIngressGateway, IVectorStore } from '@nous/shared';

const MOCK_PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as ProviderId;

// ─── Configuration helpers ─────────────────────────────────────────────────

/**
 * Config shim that adds a mock provider when config has no providers.
 * Enables the app to run without a config file (development mode).
 */
function configWithFallback(base: ConfigManager) {
  return {
    get: () => {
      const c = base.get() as Record<string, unknown>;
      const assignments = c.modelRoleAssignments as Array<{ role: string; providerId: string }> | undefined;
      const providers = c.providers as Array<Record<string, unknown>> | undefined;
      if (!assignments?.length || !providers?.length) {
        return {
          ...c,
          modelRoleAssignments: [{ role: 'reasoner', providerId: MOCK_PROVIDER_ID }],
          providers: [
            {
              id: MOCK_PROVIDER_ID,
              name: 'mock',
              type: 'text',
              modelId: 'mock',
              isLocal: true,
              capabilities: [],
            },
          ],
        };
      }
      return c;
    },
    getSection: base.getSection.bind(base),
    update: base.update.bind(base),
    reload: base.reload.bind(base),
  };
}

/**
 * Mock provider for when no real provider is configured.
 * Returns a fixed response so the app is usable without Ollama/API.
 */
function createMockProvider(providerId: ProviderId) {
  return {
    invoke: async (req: { input: unknown }) => {
      const input = req.input as { prompt?: string };
      const prompt = typeof input?.prompt === 'string' ? input.prompt : '';
      return {
        output: JSON.stringify({
          response: `[Mock] You said: ${prompt || 'nothing'}. Configure a real provider (Ollama, OpenAI) in your config for actual responses.`,
          toolCalls: [],
          memoryCandidates: [],
        }),
        providerId,
        usage: {},
        traceId: randomUUID() as TraceId,
      };
    },
    stream: async function* () {
      yield { type: 'chunk' as const, content: '' };
    },
    getConfig: () => ({
      id: providerId,
      name: 'mock',
      type: 'text' as const,
      modelId: 'mock',
      isLocal: true,
      capabilities: [],
    }),
  };
}

function resolveStmCompactionPolicy(config: unknown): StmCompactionPolicy {
  const candidate =
    typeof config === 'object' &&
    config != null &&
    'defaults' in config &&
    typeof config.defaults === 'object' &&
    config.defaults != null &&
    'stmCompactionPolicy' in config.defaults
      ? (config.defaults as { stmCompactionPolicy?: Partial<StmCompactionPolicy> })
          .stmCompactionPolicy
      : undefined;

  return StmCompactionPolicySchema.parse({
    ...DEFAULT_STM_COMPACTION_POLICY,
    ...candidate,
  });
}

function createBootstrapIngressShim(): IIngressGateway {
  return {
    submit: async (envelope) => ({
      outcome: 'rejected',
      reason: 'workflow_admission_blocked',
      reason_code: 'bootstrap_ingress_unwired',
      evidence_ref: `ingress:${envelope.trigger_id}`,
      evidence_refs: ['bootstrap does not wire ingress dispatch'],
    }),
  };
}

interface PublicMcpRuntimeBundle {
  executionBridge: PublicMcpExecutionBridge;
  surfaceService: PublicMcpSurfaceService;
}

function parseJsonArrayEnv(value: string | undefined): unknown[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function parsePublicBaseHost(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).host.toLowerCase();
  } catch {
    return null;
  }
}

// ─── Bootstrap configuration ──────────────────────────────────────────────

/**
 * Platform-specific configuration for the bootstrap.
 * The web and desktop runtimes provide different values here.
 */
export interface BootstrapConfig {
  /** Absolute path to the Nous config file, or undefined to use defaults */
  configPath?: string;
  /** Absolute path to the data directory (SQLite DB, etc.) */
  dataDir?: string;
  /** Absolute path to the instance root */
  instanceRoot?: string;
  /** Base URL for the public MCP surface (e.g., 'http://localhost:3000') */
  publicBaseUrl?: string;
  /** JSON string of hosted tenant binding seed records */
  publicMcpHostedBindingsJson?: string;
  /** JSON string of tunnel session seed records */
  publicMcpTunnelSessionsJson?: string;
  /** Label for log messages (e.g., 'web', 'desktop') */
  runtimeLabel?: string;
}

/**
 * Resolves bootstrap config from explicit values with env var fallbacks.
 * Desktop passes explicit paths; web relies on env vars.
 */
function resolveBootstrapConfig(config?: BootstrapConfig) {
  const configPath = config?.configPath ?? process.env.NOUS_CONFIG_PATH;
  const dataDirRaw = config?.dataDir ?? process.env.NOUS_DATA_DIR ?? './data';
  const dataDir = isAbsolute(dataDirRaw) ? dataDirRaw : join(process.cwd(), dataDirRaw);
  const instanceRootRaw = config?.instanceRoot ?? process.env.NOUS_INSTANCE_ROOT ?? process.cwd();
  const instanceRoot = isAbsolute(instanceRootRaw)
    ? instanceRootRaw
    : join(process.cwd(), instanceRootRaw);
  const publicBaseUrl = config?.publicBaseUrl ?? process.env.NOUS_PUBLIC_BASE_URL ?? 'http://localhost:3000';
  const publicMcpHostedBindingsJson = config?.publicMcpHostedBindingsJson ?? process.env.NOUS_PUBLIC_MCP_HOSTED_BINDINGS_JSON;
  const publicMcpTunnelSessionsJson = config?.publicMcpTunnelSessionsJson ?? process.env.NOUS_PUBLIC_MCP_TUNNEL_SESSIONS_JSON;
  const runtimeLabel = config?.runtimeLabel ?? 'shared';

  return {
    configPath,
    dataDir,
    instanceRoot,
    publicBaseUrl,
    publicMcpHostedBindingsJson,
    publicMcpTunnelSessionsJson,
    runtimeLabel,
  };
}

// ─── Service graph factory ──────────────────────────────────────────────────

/**
 * Creates the full Nous service graph. This is the platform-agnostic core
 * shared between web and desktop runtimes.
 *
 * Returns a `NousContext` with all services wired and ready to use.
 */
export function createNousServices(config?: BootstrapConfig): NousContext {
  const resolved = resolveBootstrapConfig(config);
  const { dataDir, instanceRoot, publicBaseUrl, runtimeLabel } = resolved;

  const baseConfig = new ConfigManager({ configPath: resolved.configPath });
  const appConfig = configWithFallback(baseConfig) as typeof baseConfig;
  const resolvedConfig = appConfig.get();
  const dbPath = join(dataDir, 'nous.sqlite');

  const documentStore = new SqliteDocumentStore(dbPath);
  const vectorStore = new SqliteVectorStore(dbPath);
  const runtime = new NodeRuntime();
  const embedder = new InMemoryEmbedder();
  const stmStore = new DocumentStmStore(documentStore, {
    compactionPolicy: resolveStmCompactionPolicy(resolvedConfig),
  });
  const projectStore = new DocumentProjectStore(documentStore);
  const appConfigStore = new DocumentAppConfigStore(documentStore);
  const artifactStore = new DocumentArtifactStore(documentStore);
  const scheduleStore = new DocumentScheduleStore(documentStore);
  const escalationStore = new DocumentEscalationStore(documentStore);
  const registryStore = new DocumentRegistryStore(documentStore);
  const nudgeStore = new DocumentNudgeStore(documentStore);
  const witnessService = new WitnessService(documentStore);
  const opctlService = new OpctlService({
    replayStore: new InMemoryReplayStore(),
    startLockStore: new InMemoryStartLockStore(),
    scopeLockStore: new InMemoryScopeLockStore(),
    projectControlStateStore: new InMemoryProjectControlStateStore(),
    witnessService,
  });

  const gtmGateCalculator = new GtmGateCalculator();
  const policyEngine = new MemoryAccessPolicyEngine();
  const knowledgeIndex = new KnowledgeIndexRuntime({
    documentStore,
    projectStore,
    metaVectorStore: new MetaVectorStore({ vectorStore }),
    taxonomyMapping: new DocumentProjectTaxonomyMapping(documentStore),
    relationshipGraphStore: new DocumentRelationshipGraphStore(documentStore),
    embedder,
    accessPolicyEngine: policyEngine,
    getProjectControlState: (projectId: ProjectId) =>
      opctlService.getProjectControlState(projectId),
  });

  const toolExecutor = new ToolExecutor([
    new EchoTool(),
    new DiscoverProjectsTool(knowledgeIndex),
    new RefreshProjectKnowledgeTool(knowledgeIndex),
  ]);
  const Cortex = new PfcEngine(appConfig, toolExecutor);
  const mwcPipeline = new MwcPipeline(
    documentStore,
    stmStore,
    createPfcEvaluator(Cortex),
    createPfcMutationEvaluator(Cortex),
    {
      policy: {
        policyEngine,
        projectStore,
        getProjectControlState: (projectId: ProjectId) =>
          opctlService.getProjectControlState(projectId),
      },
    },
  );

  const router = new ModelRouter(appConfig);
  const providerRegistry = new ProviderRegistry(appConfig);
  const workflowEngine = new DeterministicWorkflowEngine({
    pfcEngine: Cortex,
    modelRouter: router,
    toolExecutor,
    runtime,
    instanceRoot,
  });
  let schedulerIngressGateway = createBootstrapIngressShim();
  const schedulerService = new SchedulerService({
    scheduleStore,
    projectStore,
    ingressGateway: {
      submit: async (envelope) => schedulerIngressGateway.submit(envelope),
    },
  });
  const escalationService = new EscalationService({
    escalationStore,
    projectStore,
  });
  const registryService = new RegistryService({
    registryStore,
    escalationService,
    witnessService,
  });
  const credentialVaultService = new CredentialVaultService({
    documentStore,
  });
  const credentialOAuthBroker = new CredentialOAuthBroker({
    vaultService: credentialVaultService,
  });
  const credentialInjector = new CredentialInjector({
    vaultService: credentialVaultService,
  });
  const appCredentialInstallService = new AppCredentialInstallService({
    vaultService: credentialVaultService,
    oauthBroker: credentialOAuthBroker,
  });
  const packageLifecycleOrchestrator = new PackageLifecycleOrchestrator();
  const packageInstallService = new PackageInstallService({
    registryService,
    lifecycleOrchestrator: packageLifecycleOrchestrator,
    appCredentialInstallService,
    runtime,
    instanceRoot,
  });
  const nudgeDiscoveryService = new NudgeDiscoveryService({
    store: nudgeStore,
    registryService,
  });
  const communicationGatewayService = new CommunicationGatewayService({
    documentStore,
    escalationService,
    nudgeDiscoveryService,
    witnessService,
  });
  const endpointTrustService = new EndpointTrustService({
    documentStore,
    registryService,
    opctlService,
    escalationService,
    witnessService,
  });
  const voiceControlService = new VoiceControlService({
    documentStore,
    pfcEngine: Cortex,
    opctlService,
    endpointTrustService,
    communicationGatewayService,
    escalationService,
    witnessService,
  });
  const panelTranspiler = new PanelTranspiler();
  const appToolRegistry = new AppToolRegistry({
    register: ({
      toolId,
      definition,
      sessionId,
      appId,
    }: Parameters<AppToolRegistrar['register']>[0]) => {
      registerDynamicInternalMcpTool({
        name: toolId,
        sessionId,
        appId,
        definition: {
          name: toolId,
          version: '1.0.0',
          description: definition.description,
          inputSchema: definition.input_schema,
          outputSchema: definition.output_schema ?? {},
          capabilities: ['execute'],
          permissionScope: 'project',
        },
        execute: async () => {
          throw new Error(
            `App tool invocation bridge is unavailable for ${toolId}`,
          );
        },
      });
      return { witnessRef: `dynamic-tool:${toolId}` };
    },
    unregister: (toolId: string) => {
      unregisterDynamicInternalMcpTool(toolId);
    },
  });
  const appRuntimeService = new AppRuntimeService({
    lifecycleOrchestrator: packageLifecycleOrchestrator,
    toolRegistry: appToolRegistry,
    communicationGatewayService,
    panelTranspiler,
  });
  const appInstallService = new AppInstallService({
    registryService,
    packageInstallService,
    appCredentialInstallService,
    appRuntimeService,
    configStore: appConfigStore,
    runtime,
    witnessService,
    instanceRoot,
  });
  const appSettingsService = new AppSettingsService({
    appCredentialInstallService,
    appRuntimeService,
    configStore: appConfigStore,
    runtime,
    instanceRoot,
  });
  const maoProjectionService = new MaoProjectionService({
    opctlService,
    workflowEngine,
    escalationService,
    schedulerService,
    voiceControlService,
    witnessService,
  });
  const publicMcpNamespaceStore = new NamespaceRegistryStore(documentStore);
  const publicMcpAuditStore = new AuditProjectionStore(documentStore);
  const publicMcpQuotaUsageStore = new QuotaUsageStore(documentStore);
  const publicMcpRateLimitStore = new RateLimitBucketStore(documentStore);
  const externalSourceStorageAdapter = new ExternalSourceStorageAdapter(documentStore, {
    vectorStore,
    embedder,
  });
  const promotedMemoryBridgeService = new PromotedMemoryBridgeService({
    documentStore,
    namespaceStore: publicMcpNamespaceStore,
    storageAdapter: externalSourceStorageAdapter,
    pfc: Cortex,
    witnessService,
    vectorStore,
    embedder,
  });

  const getProvider = (id: ProviderId) => {
    if (id === MOCK_PROVIDER_ID) {
      return createMockProvider(id) as ReturnType<typeof providerRegistry.getProvider>;
    }
    return providerRegistry.getProvider(id);
  };

  const createRuntimeProjectApi = (projectId: ProjectId) =>
    createGatewayProjectApi(projectId, {
      mwcPipeline,
      artifactStore,
      escalationService,
      schedulerService,
      toolExecutor,
      router,
      getProvider,
    });

  const buildPublicAgents = (): readonly PublicMcpRuntimeAgentDefinition[] => [
    {
      catalog: {
        agentId: 'engineering.workflow',
        title: 'Engineering Workflow',
        description:
          'A public-safe orchestration agent for structured engineering tasks.',
        inputModes: ['text', 'packet', 'json'],
        memoryBinding: {
          supported: true,
          readTiers: ['stm', 'ltm'],
          writeTiers: ['stm'],
        },
        execution: {
          taskSupport: 'optional',
          asyncThreshold: 'long_running_only',
        },
      },
      targetClass: 'Orchestrator',
      buildTaskInstructions: (request) =>
        [
          'Process the authenticated public engineering workflow request.',
          'Preserve the canonical AgentGateway and lifecycle-tool execution posture.',
          'Return a concise, public-safe result.',
          `Requested agent: ${request.arguments.agentId}`,
          request.arguments.input.type === 'json'
            ? 'Input payload is attached as structured JSON.'
            : `Input: ${request.arguments.input.text}`,
        ].join('\n'),
      buildPayload: (request) => ({
        subject: {
          clientId: request.subject.clientId,
          namespace: request.subject.namespace,
        },
        input: request.arguments.input,
        memory: request.arguments.memory,
      }),
    },
  ];

  const buildPublicMcpRuntimeBundle = (args: {
    backendMode: 'development' | 'local_tunnel' | 'hosted';
    serverName?: string;
    phase?: string;
    documentStore: IDocumentStore;
    vectorStore?: IVectorStore;
    namespaceStore: NamespaceRegistryStore;
    auditStore: AuditProjectionStore;
    taskStore: PublicMcpTaskProjectionStore;
    quotaStore: QuotaUsageStore;
    rateLimitStore: RateLimitBucketStore;
    witnessService: WitnessService;
    pfcEngine: PfcEngine;
    publicWorkflowEngine: DeterministicWorkflowEngine;
    runtimeContext?: {
      deploymentMode?: 'development' | 'local_tunnel' | 'hosted';
      tenantId?: string;
      userHandle?: string;
    };
    storageAdapter?: ExternalSourceStorageAdapter;
    promotedBridgeService?: PromotedMemoryBridgeService;
  }): PublicMcpRuntimeBundle => {
    const storageAdapter =
      args.storageAdapter ??
      new ExternalSourceStorageAdapter(args.documentStore, {
        vectorStore: args.vectorStore,
        embedder,
      });
    const publicPromotedBridgeService =
      args.promotedBridgeService ??
      new PromotedMemoryBridgeService({
        documentStore: args.documentStore,
        namespaceStore: args.namespaceStore,
        storageAdapter,
        pfc: args.pfcEngine,
        witnessService: args.witnessService,
        vectorStore: args.vectorStore,
        embedder,
      });
    const externalSourceMemoryService = new ExternalSourceMemoryService({
      documentStore: args.documentStore,
      namespaceStore: args.namespaceStore,
      auditStore: args.auditStore,
      storageAdapter,
      quotaStore: args.quotaStore,
      rateLimitStore: args.rateLimitStore,
      witnessService: args.witnessService,
    });
    const runtimeAdapter = new PublicMcpRuntimeAdapter({
      modelRouter: router,
      getProvider,
      getProjectApi: createRuntimeProjectApi,
      toolExecutor,
      pfc: args.pfcEngine,
      workflowEngine: args.publicWorkflowEngine,
      projectStore,
      scheduler: schedulerService,
      escalationService,
      witnessService: args.witnessService,
      opctlService,
      runtime,
      instanceRoot,
      outputSchemaValidator: new DefaultSchemaRefValidator(),
      promotedMemoryBridgeService: publicPromotedBridgeService,
    });
    const surfaceService = new PublicMcpSurfaceService({
      runtimeAdapter,
      taskStore: args.taskStore,
      auditStore: args.auditStore,
      publicAgents: buildPublicAgents(),
      serverName: args.serverName ?? 'Nous Public MCP',
      phase: args.phase ?? 'phase-13.5',
      backendMode: args.backendMode,
      runtimeContext: args.runtimeContext,
    });
    const publicCapabilityHandlers = createCapabilityHandlers({
      agentClass: 'Worker',
      agentId: 'public-mcp-runtime' as any,
      deps: {
        externalSourceMemoryService,
        publicMcpSurfaceService: surfaceService,
      },
    });

    return {
      surfaceService,
      executionBridge: new PublicMcpExecutionBridge({
        executor: {
          execute: async (internalName, request) => {
            const handler =
              publicCapabilityHandlers[internalName as keyof typeof publicCapabilityHandlers];
            if (!handler) {
              throw new Error(`Public MCP handler ${internalName} is unavailable`);
            }
            return handler(request);
          },
        },
      }),
    };
  };

  const publicMcpTaskStore = new PublicMcpTaskProjectionStore(documentStore);
  const hostedBindingSeeds = parseJsonArrayEnv(
    resolved.publicMcpHostedBindingsJson,
  ).map((record) => PublicMcpHostedTenantBindingRecordSchema.parse(record));
  const tunnelSessionSeeds = parseJsonArrayEnv(
    resolved.publicMcpTunnelSessionsJson,
  ).map((record) => PublicMcpTunnelSessionRecordSchema.parse(record));
  const publicMcpHostedBindingStore = new HostedTenantBindingStore(documentStore, {
    seedRecords: hostedBindingSeeds,
  });
  const publicMcpTunnelSessionStore = new TunnelSessionStore(documentStore, {
    seedRecords: tunnelSessionSeeds,
  });
  const publicMcpDeploymentRouter = new DeploymentRouterService({
    hostedTenantBindingStore: publicMcpHostedBindingStore,
    tunnelSessionStore: publicMcpTunnelSessionStore,
    developmentHosts: [
      'localhost:3000',
      '127.0.0.1:3000',
      ...(parsePublicBaseHost(publicBaseUrl) ? [parsePublicBaseHost(publicBaseUrl)!] : []),
    ],
  });
  const publicMcpTunnelForwarder = new TunnelForwarder({
    sessionStore: publicMcpTunnelSessionStore,
  });
  const developmentPublicMcpBundle = buildPublicMcpRuntimeBundle({
    backendMode: 'development',
    documentStore,
    vectorStore,
    namespaceStore: publicMcpNamespaceStore,
    auditStore: publicMcpAuditStore,
    taskStore: publicMcpTaskStore,
    quotaStore: publicMcpQuotaUsageStore,
    rateLimitStore: publicMcpRateLimitStore,
    witnessService,
    pfcEngine: Cortex,
    publicWorkflowEngine: workflowEngine,
    storageAdapter: externalSourceStorageAdapter,
    promotedBridgeService: promotedMemoryBridgeService,
  });
  const tunnelPublicMcpBundle = buildPublicMcpRuntimeBundle({
    backendMode: 'local_tunnel',
    documentStore,
    vectorStore,
    namespaceStore: publicMcpNamespaceStore,
    auditStore: publicMcpAuditStore,
    taskStore: publicMcpTaskStore,
    quotaStore: publicMcpQuotaUsageStore,
    rateLimitStore: publicMcpRateLimitStore,
    witnessService,
    pfcEngine: Cortex,
    publicWorkflowEngine: workflowEngine,
    runtimeContext: {
      deploymentMode: 'local_tunnel',
    },
    storageAdapter: externalSourceStorageAdapter,
    promotedBridgeService: promotedMemoryBridgeService,
  });
  const hostedTenantRuntimeFactory = new HostedTenantRuntimeFactory<PublicMcpRuntimeBundle>({
    documentStore,
    vectorStore,
    build: ({ binding, documentStore: tenantDocumentStore, vectorStore: tenantVectorStore }) => {
      const tenantPfc = new PfcEngine(appConfig, toolExecutor);
      const tenantWorkflowEngine = new DeterministicWorkflowEngine({
        pfcEngine: tenantPfc,
        modelRouter: router,
        toolExecutor,
        runtime,
        instanceRoot,
      });
      const tenantWitnessService = new WitnessService(tenantDocumentStore);

      return buildPublicMcpRuntimeBundle({
        backendMode: 'hosted',
        serverName: binding.serverName,
        phase: binding.phase,
        documentStore: tenantDocumentStore,
        vectorStore: tenantVectorStore,
        namespaceStore: new NamespaceRegistryStore(tenantDocumentStore),
        auditStore: new AuditProjectionStore(tenantDocumentStore),
        taskStore: new PublicMcpTaskProjectionStore(tenantDocumentStore),
        quotaStore: new QuotaUsageStore(tenantDocumentStore),
        rateLimitStore: new RateLimitBucketStore(tenantDocumentStore),
        witnessService: tenantWitnessService,
        pfcEngine: tenantPfc,
        publicWorkflowEngine: tenantWorkflowEngine,
        runtimeContext: {
          deploymentMode: 'hosted',
          tenantId: binding.tenantId,
          userHandle: binding.userHandle,
        },
      });
    },
  });
  const publicMcpExecutionBridge = developmentPublicMcpBundle.executionBridge;
  const publicMcpGatewayService = new PublicMcpGatewayService({
    documentStore,
    namespaceStore: publicMcpNamespaceStore,
    auditStore: publicMcpAuditStore,
    witnessService,
    executionBridge: publicMcpExecutionBridge,
    baseUrl: publicBaseUrl,
    supportedScopes: PublicMcpScopeSchema.options,
    toolMappingLookup: getPublicToolMapping,
    requiredScopeResolver: (toolName, args) => {
      const mapping = getPublicToolMapping(toolName);
      return mapping ? resolvePublicMcpRequiredScopes(mapping, args) : [];
    },
    surfaceService: developmentPublicMcpBundle.surfaceService,
    deploymentRouter: publicMcpDeploymentRouter,
    deploymentBundleResolver: async (resolution) => {
      if (resolution.mode === 'local_tunnel') {
        return tunnelPublicMcpBundle;
      }
      if (resolution.mode === 'hosted') {
        const binding = resolution.bindingId
          ? await publicMcpHostedBindingStore.get(resolution.bindingId)
          : resolution.userHandle
            ? await publicMcpHostedBindingStore.getByUserHandle(resolution.userHandle)
            : null;
        if (!binding) {
          throw new Error(`Hosted public MCP binding is unavailable for ${resolution.requestHost}`);
        }
        return hostedTenantRuntimeFactory.getOrCreate(binding);
      }
      return developmentPublicMcpBundle;
    },
    tunnelForwarder: publicMcpTunnelForwarder,
  });

  const coreExecutor = new GatewayBackedTurnExecutor({
    modelRouter: router,
    getProvider,
    stmStore,
    mwcPipeline,
    documentStore,
    witnessService,
    opctlService,
    getProjectApi: createRuntimeProjectApi,
    toolExecutor,
    workflowEngine,
    projectStore,
    scheduler: schedulerService,
    escalationService,
    runtime,
    instanceRoot,
    outputSchemaValidator: new DefaultSchemaRefValidator(),
  });

  const gatewayRuntime = createPrincipalSystemGatewayRuntime({
    documentStore,
    modelRouter: router,
    getProvider: (providerId) => getProvider(providerId as ProviderId),
    getProjectApi: (projectId: ProjectId) => createRuntimeProjectApi(projectId),
    toolExecutor,
    pfc: Cortex,
    workflowEngine,
    projectStore,
    scheduler: schedulerService,
    escalationService,
    witnessService,
    opctlService,
    runtime,
    appRuntimeService,
    credentialVaultService,
    credentialInjector,
    appCredentialInstallService,
    instanceRoot,
    outputSchemaValidator: new DefaultSchemaRefValidator(),
  });
  providerRegistry.onLeaseReleased((event) => {
    void gatewayRuntime.notifyLeaseReleased({
      laneKey: event.laneKey,
      leaseId: event.leaseId,
    });
  });
  schedulerIngressGateway = new GatewayRuntimeIngressAdapter(gatewayRuntime);

  const context: NousContext = {
    // Type assertion: GatewayBackedTurnExecutor satisfies ICoreExecutor structurally,
    // but cortex-core uses zod v4 BRAND markers while shared uses zod v3.
    // Pre-existing monorepo zod version split — safe to assert until aligned.
    coreExecutor: coreExecutor as NousContext['coreExecutor'],
    gatewayRuntime,
    projectStore,
    stmStore,
    mwcPipeline,
    documentStore,
    config: appConfig,
    router,
    getProvider,
    witnessService,
    opctlService,
    maoProjectionService,
    gtmGateCalculator,
    knowledgeIndex,
    workflowEngine,
    artifactStore,
    schedulerService,
    escalationService,
    endpointTrustService,
    registryService,
    appInstallService,
    appSettingsService,
    packageInstallService,
    nudgeDiscoveryService,
    voiceControlService,
    publicMcpGatewayService,
    publicMcpExecutionBridge,
    appRuntimeService,
    panelTranspiler,
    dataDir,
  };

  console.log(`[nous:${runtimeLabel}] bootstrap complete`);
  return context;
}
