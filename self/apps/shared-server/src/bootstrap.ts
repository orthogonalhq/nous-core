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
  ModelRole,
  ModelProviderConfig,
  ProviderId,
  TraceId,
  StmCompactionPolicy,
  WorkflowNodeKind,
  IWorkflowNodeHandler,
} from '@nous/shared';
import {
  ConfigManager,
  DEFAULT_PROFILES,
} from '@nous/autonomic-config';
import type {
  ModelRoleAssignment,
  Profile,
  ProviderConfigEntry,
} from '@nous/autonomic-config';
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
  CheckpointManager,
  DefaultSchemaRefValidator,
  GatewayBackedTurnExecutor,
  GatewayRuntimeIngressAdapter,
  InMemoryRecoveryLedgerStore,
  PublicMcpExecutionBridge,
  PublicMcpRuntimeAdapter,
  RecoveryOrchestrator,
  WorkmodeAdmissionGuard,
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
import { ProviderRegistry, TokenAccumulatorService } from '@nous/subcortex-providers';
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
import { MaoProjectionService, InferenceProjectionAdapter } from '@nous/subcortex-mao';
import { registerCodingAgentNodeTypes } from '@nous/subcortex-coding-agents';
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
import { HealthAggregator, HealthMonitor } from '@nous/autonomic-health';
import { EventBus } from './event-bus/event-bus.js';
import { ThoughtEmitterImpl } from './event-bus/thought-emitter.js';
import { GatewayHealthSourceAdapter } from './adapters/gateway-health-source-adapter.js';
import type { NousContext } from './context';
import type { IDocumentStore, IIngressGateway, IVectorStore } from '@nous/shared';

const MOCK_PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as ProviderId;
type CloudProviderName = 'anthropic' | 'openai';
type ProviderName = CloudProviderName | 'ollama';
type ParsedModelSpec = { provider: ProviderName; modelId: string };

const MODEL_SELECTION_COLLECTION = 'nous:model_selection';
const MODEL_SELECTION_ID = 'current';

const CLOUD_PROVIDER_ENV_VARS: Record<CloudProviderName, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
};

export const WELL_KNOWN_PROVIDER_IDS: Record<CloudProviderName, ProviderId> = {
  anthropic: '10000000-0000-0000-0000-000000000001' as ProviderId,
  openai: '10000000-0000-0000-0000-000000000002' as ProviderId,
};
export const OLLAMA_WELL_KNOWN_PROVIDER_ID =
  '10000000-0000-0000-0000-000000000003' as ProviderId;

const CLOUD_PROVIDER_DEFAULT_MODELS: Record<CloudProviderName, string> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
};

// ─── Configuration helpers ─────────────────────────────────────────────────

/**
 * Config shim that adds a mock provider when config has no providers.
 * Enables the app to run without a config file (development mode).
 */
function hasConfiguredCloudKey(): boolean {
  return (Object.values(CLOUD_PROVIDER_ENV_VARS) as string[]).some(
    (envVar) => !!process.env[envVar],
  );
}

function hasConfiguredProviderKey(provider: CloudProviderName): boolean {
  return !!process.env[CLOUD_PROVIDER_ENV_VARS[provider]];
}

function currentProviderEntries(ctx: NousContext): ProviderConfigEntry[] {
  const config = ctx.config.get() as { providers?: ProviderConfigEntry[] };
  return Array.isArray(config.providers) ? config.providers : [];
}

function isProviderName(provider: string): provider is ProviderName {
  return (
    provider === 'anthropic' ||
    provider === 'openai' ||
    provider === 'ollama'
  );
}

function isCloudProvider(provider: ProviderName): provider is CloudProviderName {
  return provider === 'anthropic' || provider === 'openai';
}

export function currentRoleAssignment(
  ctx: NousContext,
  role: ModelRole,
): ModelRoleAssignment | undefined {
  const config = ctx.config.get() as {
    modelRoleAssignments?: ModelRoleAssignment[];
  };
  return config.modelRoleAssignments?.find((assignment) => assignment.role === role);
}

export function currentReasonerAssignment(
  ctx: NousContext,
): ModelRoleAssignment | undefined {
  return currentRoleAssignment(ctx, 'reasoner');
}

function sortProvidersForDefault(
  providers: ProviderConfigEntry[],
): ProviderConfigEntry[] {
  return [...providers].sort((a, b) => {
    if (a.isLocal !== b.isLocal) {
      return a.isLocal ? 1 : -1;
    }

    return a.name.localeCompare(b.name);
  });
}

export async function updateRoleAssignment(
  ctx: NousContext,
  role: ModelRole,
  providerId: ProviderId | null,
  fallbackProviderId?: ProviderId,
): Promise<void> {
  const config = ctx.config.get() as {
    modelRoleAssignments?: ModelRoleAssignment[];
  };
  const existingAssignments = Array.isArray(config.modelRoleAssignments)
    ? config.modelRoleAssignments
    : [];
  const nextAssignment = providerId
    ? {
        role,
        providerId,
        ...(fallbackProviderId &&
        fallbackProviderId !== providerId
          ? { fallbackProviderId }
          : {}),
      }
    : null;
  const nextAssignments: ModelRoleAssignment[] = [];
  let replaced = false;

  for (const assignment of existingAssignments) {
    if (assignment.role !== role) {
      nextAssignments.push(assignment);
      continue;
    }

    replaced = true;
    if (nextAssignment) {
      nextAssignments.push(nextAssignment);
    }
  }

  if (!replaced && nextAssignment) {
    nextAssignments.push(nextAssignment);
  }

  await ctx.config.update(
    'modelRoleAssignments',
    // IConfig.update() exposes section values as unknown through the shared
    // index-signature config contract; ConfigManager.update() runtime-validates
    // the full config with SystemConfigSchema before committing.
    nextAssignments as any,
  );
}

export async function updateReasonerAssignment(
  ctx: NousContext,
  providerId: ProviderId | null,
  fallbackProviderId?: ProviderId,
): Promise<void> {
  await updateRoleAssignment(ctx, 'reasoner', providerId, fallbackProviderId);
}

async function ensureCloudCompatibleProfile(ctx: NousContext): Promise<void> {
  if (!hasConfiguredCloudKey()) {
    return;
  }

  const config = ctx.config.get() as { profile?: Profile };
  const profileName = config.profile?.name;
  if (profileName !== 'local-only' && profileName !== 'local_strict') {
    return;
  }

  await ctx.config.update('profile', {
    ...DEFAULT_PROFILES.hybrid,
    allowSilentLocalToRemoteFailover: true,
  });
}

async function ensureLocalCompatibleProfile(ctx: NousContext): Promise<void> {
  if (hasConfiguredCloudKey()) {
    return;
  }

  const providers = currentProviderEntries(ctx);
  const hasRemoteProviders = providers.some((provider) => !provider.isLocal);
  if (hasRemoteProviders) {
    return;
  }

  const config = ctx.config.get() as { profile?: Profile };
  const profileName = config.profile?.name;
  if (profileName === 'local-only' || profileName === 'local_strict') {
    return;
  }

  await ctx.config.update('profile', DEFAULT_PROFILES['local-only']);
}

export function parseSelectedModelSpec(
  spec: string | null | undefined,
): ParsedModelSpec | null {
  if (!spec) {
    return null;
  }

  const [provider, ...modelParts] = spec.split(':');
  const modelId = modelParts.join(':');
  if (!isProviderName(provider) || modelId.length === 0) {
    return null;
  }

  return {
    provider,
    modelId,
  };
}

export function buildProviderConfig(
  provider: CloudProviderName,
  providerId: ProviderId = WELL_KNOWN_PROVIDER_IDS[provider],
  modelId: string = CLOUD_PROVIDER_DEFAULT_MODELS[provider],
): ModelProviderConfig {
  if (provider === 'anthropic') {
    return {
      id: providerId,
      name: provider,
      type: 'text',
      endpoint: 'https://api.anthropic.com',
      modelId,
      isLocal: false,
      capabilities: ['chat', 'streaming'],
      providerClass: 'remote_text',
    };
  }

  return {
    id: providerId,
    name: provider,
    type: 'text',
    endpoint: 'https://api.openai.com',
    modelId,
    isLocal: false,
    capabilities: ['chat', 'streaming'],
    providerClass: 'remote_text',
  };
}

export function buildOllamaProviderConfig(
  modelId: string,
  providerId: ProviderId = OLLAMA_WELL_KNOWN_PROVIDER_ID,
): ModelProviderConfig {
  return {
    id: providerId,
    name: 'ollama',
    type: 'text',
    endpoint: 'http://localhost:11434',
    modelId,
    isLocal: true,
    capabilities: ['chat', 'streaming'],
    providerClass: 'local_text',
  };
}

function selectedModelProviderId(selection: ParsedModelSpec): ProviderId {
  return isCloudProvider(selection.provider)
    ? WELL_KNOWN_PROVIDER_IDS[selection.provider]
    : OLLAMA_WELL_KNOWN_PROVIDER_ID;
}

function buildSelectedProviderConfig(
  selection: ParsedModelSpec,
  providerId: ProviderId = selectedModelProviderId(selection),
): ModelProviderConfig {
  return isCloudProvider(selection.provider)
    ? buildProviderConfig(selection.provider, providerId, selection.modelId)
    : buildOllamaProviderConfig(selection.modelId, providerId);
}

function canApplySelectedModel(selection: ParsedModelSpec): boolean {
  return !isCloudProvider(selection.provider) || hasConfiguredProviderKey(selection.provider);
}

function toProviderConfigEntry(
  config: ModelProviderConfig,
): ProviderConfigEntry {
  return {
    id: config.id,
    name: config.name,
    type: config.type,
    endpoint: config.endpoint,
    modelId: config.modelId,
    isLocal: config.isLocal,
    maxTokens: config.maxTokens,
    capabilities: config.capabilities,
    providerClass: config.providerClass,
    meetsProfiles: config.meetsProfiles,
  };
}

export async function upsertProviderConfig(
  ctx: NousContext,
  providerConfig: ModelProviderConfig,
): Promise<void> {
  ctx.providerRegistry.registerProvider(providerConfig);

  const existingProviders = currentProviderEntries(ctx);
  const nextProviders = [
    ...existingProviders.filter((provider) => provider.id !== providerConfig.id),
    toProviderConfigEntry(providerConfig),
  ];

  await ctx.config.update(
    'providers',
    // IConfig.update() exposes section values as unknown through the shared
    // index-signature config contract; ConfigManager.update() runtime-validates
    // the full config with SystemConfigSchema before committing.
    nextProviders as any,
  );
}

async function removeProviderConfig(
  ctx: NousContext,
  providerId: ProviderId,
): Promise<void> {
  ctx.providerRegistry.removeProvider(providerId);

  const existingProviders = currentProviderEntries(ctx);
  const nextProviders = existingProviders.filter(
    (provider) => provider.id !== providerId,
  );

  await ctx.config.update(
    'providers',
    // IConfig.update() exposes section values as unknown through the shared
    // index-signature config contract; ConfigManager.update() runtime-validates
    // the full config with SystemConfigSchema before committing.
    nextProviders as any,
  );
}

function configWithFallback(base: ConfigManager) {
  return {
    get: () => {
      const c = base.get() as Record<string, unknown>;
      const assignments = c.modelRoleAssignments as Array<{ role: string; providerId: string }> | undefined;
      const providers = c.providers as Array<Record<string, unknown>> | undefined;
      if (!assignments?.length || !providers?.length) {
        if (hasConfiguredCloudKey()) {
          console.log(
            '[nous:bootstrap] Mock fallback suppressed — real API keys detected',
          );
          return c;
        }
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
  const codingAgentNodeHandlerOverrides = new Map<WorkflowNodeKind, IWorkflowNodeHandler>();
  const codingAgentMaoEvents: Array<{ type: string; data: unknown; timestamp: string }> = [];
  registerCodingAgentNodeTypes(codingAgentNodeHandlerOverrides, {
    pfcEngine: Cortex,
    witnessService,
    onMaoEvent: (event) => {
      codingAgentMaoEvents.push(event);
    },
  });
  const eventBus = new EventBus();
  const workflowEngine = new DeterministicWorkflowEngine({
    pfcEngine: Cortex,
    modelRouter: router,
    toolExecutor,
    runtime,
    instanceRoot,
    nodeHandlerOverrides: codingAgentNodeHandlerOverrides,
    eventBus,
  });
  let schedulerIngressGateway = createBootstrapIngressShim();
  const schedulerService = new SchedulerService({
    scheduleStore,
    projectStore,
    ingressGateway: {
      submit: async (envelope) => schedulerIngressGateway.submit(envelope),
    },
  });
  const providerRegistry = new ProviderRegistry(appConfig, { eventBus });
  const tokenAccumulator = new TokenAccumulatorService(eventBus);
  const inferenceAdapter = new InferenceProjectionAdapter(eventBus);
  const thoughtEmitter = new ThoughtEmitterImpl(eventBus);
  Cortex.setThoughtEmitter(thoughtEmitter);
  const escalationService = new EscalationService({
    escalationStore,
    projectStore,
    eventBus,
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
  const packageLifecycleOrchestrator = new PackageLifecycleOrchestrator({
    credentialVaultService,
    eventBus,
  });
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
    eventBus,
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
    eventBus,
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
    eventBus,
    inferenceAdapter,
    projectStore,
  });
  const workmodeAdmissionGuard = new WorkmodeAdmissionGuard();
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
      workmodeAdmissionGuard,
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
        workmodeAdmissionGuard,
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
    thoughtEmitter,
    pfcEngine: Cortex,
  });

  // Recovery component instantiation (Phase 1.2 — WR-072)
  const recoveryLedgerStore = new InMemoryRecoveryLedgerStore();
  const checkpointManager = new CheckpointManager(recoveryLedgerStore);
  const recoveryOrchestrator = new RecoveryOrchestrator();

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
    // Model routing: Principal uses 'thinking' profile (Opus 4.6),
    // System uses 'fast' profile (Sonnet). The defaultModelRequirements
    // applies to System gateway execution. Principal gateway uses its own
    // model provider or the model router with 'thinking' requirements.
    defaultModelRequirements: {
      profile: 'fast',
      fallbackPolicy: 'block_if_unmet',
    },
    eventBus,
    // Recovery component injection (Phase 1.2 — WR-072)
    // Type assertion: cortex-core uses zod v4 BRAND markers while shared uses zod v3.
    // Pre-existing monorepo zod version split — safe to assert until aligned.
    checkpointManager: checkpointManager as any,
    recoveryLedgerStore,
    recoveryOrchestrator,
  });
  providerRegistry.onLeaseReleased((event) => {
    void gatewayRuntime.notifyLeaseReleased({
      laneKey: event.laneKey,
      leaseId: event.leaseId,
    });
  });
  schedulerIngressGateway = new GatewayRuntimeIngressAdapter(gatewayRuntime);

  const agentSessions = new Map<string, import('./context').AgentSessionEntry>();

  // Health monitoring DI wiring (SP 1.2)
  const gatewayHealthAdapter = new GatewayHealthSourceAdapter(gatewayRuntime);
  const healthAggregator = new HealthAggregator({
    gatewayHealthSource: gatewayHealthAdapter,
    providerHealthSource: providerRegistry,
    eventBus,
  });
  const healthMonitor = new HealthMonitor({ aggregator: healthAggregator });
  maoProjectionService.setHealthAggregator(healthAggregator);

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
    credentialVaultService,
    providerRegistry,
    panelTranspiler,
    dataDir,
    codingAgentMaoEvents,
    agentSessions,
    eventBus,
    healthAggregator,
    healthMonitor,
    tokenAccumulator,
  };

  console.log(`[nous:${runtimeLabel}] bootstrap complete`);
  return context;
}

/**
 * Loads the saved model selection from the document store and applies it
 * as `defaultModelRequirements` hints on the gateway runtime.
 *
 * If no selection has been persisted, auto-detection is left in place.
 * Call this after `createNousServices()`.
 */
export async function loadModelSelection(ctx: NousContext): Promise<void> {
  try {
    const saved = await ctx.documentStore.get<{
      principal: string | null;
      system: string | null;
    }>(MODEL_SELECTION_COLLECTION, MODEL_SELECTION_ID);

    if (saved) {
      if (saved.principal) {
        console.log(
          `[nous:bootstrap] Loaded principal model selection: ${saved.principal}`,
        );
      }
      if (saved.system) {
        console.log(
          `[nous:bootstrap] Loaded system model selection: ${saved.system}`,
        );
      }
    }

    const primarySelection = parseSelectedModelSpec(saved?.principal);
    const secondarySelection = parseSelectedModelSpec(saved?.system);
    const primaryProviderId =
      primarySelection && canApplySelectedModel(primarySelection)
        ? selectedModelProviderId(primarySelection)
        : null;
    const secondaryProviderId =
      secondarySelection && canApplySelectedModel(secondarySelection)
        ? selectedModelProviderId(secondarySelection)
        : null;

    if (primarySelection && primaryProviderId) {
      await upsertProviderConfig(
        ctx,
        buildSelectedProviderConfig(primarySelection, primaryProviderId),
      );
    }

    if (
      secondarySelection &&
      secondaryProviderId &&
      (!primarySelection ||
        secondarySelection.provider !== primarySelection.provider ||
        secondarySelection.modelId !== primarySelection.modelId)
    ) {
      await upsertProviderConfig(
        ctx,
        buildSelectedProviderConfig(secondarySelection, secondaryProviderId),
      );
    }

    if (primaryProviderId) {
      await updateReasonerAssignment(
        ctx,
        primaryProviderId,
        secondaryProviderId ?? undefined,
      );
      return;
    }

    if (secondaryProviderId) {
      await updateReasonerAssignment(
        ctx,
        secondaryProviderId,
      );
      return;
    }

    const availableProviders = sortProvidersForDefault(currentProviderEntries(ctx));
    if (availableProviders.length > 0) {
      await updateReasonerAssignment(ctx, availableProviders[0]!.id);
    }
  } catch {
    // Model selection not yet persisted — use auto-detect defaults.
    const availableProviders = sortProvidersForDefault(currentProviderEntries(ctx));
    if (availableProviders.length > 0) {
      await updateReasonerAssignment(ctx, availableProviders[0]!.id);
    }
  }
}

/**
 * Loads stored API keys from the credential vault into process.env
 * so the SDK can use them immediately on restart.
 * Call this after `createNousServices()`.
 */
export async function loadStoredApiKeys(ctx: NousContext): Promise<void> {
  const SYSTEM_APP_ID = 'nous:system';
  const keyMap: Array<{ vaultKey: string; envVar: string }> = [
    { vaultKey: 'api_key_anthropic', envVar: 'ANTHROPIC_API_KEY' },
    { vaultKey: 'api_key_openai', envVar: 'OPENAI_API_KEY' },
  ];

  for (const { vaultKey, envVar } of keyMap) {
    try {
      const resolved = await ctx.credentialVaultService.resolveForInjection(
        SYSTEM_APP_ID,
        vaultKey,
      );
      if (resolved) {
        process.env[envVar] = resolved.secretValue;
        console.log(`[nous:bootstrap] Loaded stored ${envVar} from credential vault`);
      }
    } catch {
      // Ignore — key may not exist
    }
  }
}

export async function registerStoredProviders(ctx: NousContext): Promise<void> {
  await ensureCloudCompatibleProfile(ctx);

  const availableProviders = (
    Object.keys(WELL_KNOWN_PROVIDER_IDS) as CloudProviderName[]
  ).filter((provider) => !!process.env[CLOUD_PROVIDER_ENV_VARS[provider]]);

  for (const provider of availableProviders) {
    await upsertProviderConfig(
      ctx,
      buildProviderConfig(provider),
    );
  }

  if (!currentReasonerAssignment(ctx) && availableProviders.length > 0) {
    await updateReasonerAssignment(ctx, WELL_KNOWN_PROVIDER_IDS[availableProviders[0]!]);
  }

  if (availableProviders.length === 0) {
    await ensureLocalCompatibleProfile(ctx);
  }
}

export async function registerConfiguredProvider(
  ctx: NousContext,
  provider: CloudProviderName,
  modelId: string = CLOUD_PROVIDER_DEFAULT_MODELS[provider],
): Promise<void> {
  await ensureCloudCompatibleProfile(ctx);
  await upsertProviderConfig(
    ctx,
    buildProviderConfig(
      provider,
      WELL_KNOWN_PROVIDER_IDS[provider],
      modelId,
    ),
  );

  const existingAssignment = currentReasonerAssignment(ctx);
  await updateReasonerAssignment(
    ctx,
    WELL_KNOWN_PROVIDER_IDS[provider],
    existingAssignment?.providerId &&
      existingAssignment.providerId !== WELL_KNOWN_PROVIDER_IDS[provider]
      ? existingAssignment.providerId
      : undefined,
  );
}

export async function removeConfiguredProvider(
  ctx: NousContext,
  provider: CloudProviderName,
): Promise<void> {
  const providerId = WELL_KNOWN_PROVIDER_IDS[provider];
  await removeProviderConfig(ctx, providerId);

  const remainingProviders = sortProvidersForDefault(currentProviderEntries(ctx));
  const nextPrimary = remainingProviders[0]?.id ?? null;
  const nextFallback = remainingProviders[1]?.id;

  await updateReasonerAssignment(ctx, nextPrimary, nextFallback);
  await ensureLocalCompatibleProfile(ctx);
}
