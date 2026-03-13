/**
 * Bootstrap — wires the Nous stack for the web app.
 *
 * Creates document store, STM, projects, MWC pipeline, Cortex, router,
 * providers, and core executor. Uses NOUS_DATA_DIR and NOUS_CONFIG_PATH env.
 */
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_STM_COMPACTION_POLICY,
  StmCompactionPolicySchema,
} from '@nous/shared';
import type {
  ProjectId,
  ProviderId,
  TraceId,
  StmCompactionPolicy,
} from '@nous/shared';
import { ConfigManager } from '@nous/autonomic-config';
import { InMemoryEmbedder } from '@nous/autonomic-embeddings';
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
  CoreExecutor,
  GatewayRuntimeIngressAdapter,
  PassthroughOutputSchemaValidator,
  createPrincipalSystemGatewayRuntime,
} from '@nous/cortex-core';
import { DocumentProjectStore } from '@nous/subcortex-projects';
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
import { MemoryAccessPolicyEngine } from '@nous/memory-access';
import type { NousContext } from './context';
import type { IIngressGateway, IProjectApi, ModelRole } from '@nous/shared';

const MOCK_PROVIDER_ID = '00000000-0000-0000-0000-000000000001' as ProviderId;

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
      reason_code: 'web_bootstrap_ingress_unwired',
      evidence_ref: `ingress:${envelope.trigger_id}`,
      evidence_refs: ['web bootstrap does not wire ingress dispatch'],
    }),
  };
}

let cachedContext: NousContext | null = null;

export function clearNousContextCache(): void {
  cachedContext = null;
}

export function createNousContext(): NousContext {
  if (cachedContext) {
    return cachedContext;
  }

  const configPath = process.env.NOUS_CONFIG_PATH;
  const baseConfig = new ConfigManager({ configPath });
  const config = configWithFallback(baseConfig) as typeof baseConfig;
  const resolvedConfig = config.get();
  const dataDirEnv = process.env.NOUS_DATA_DIR ?? './data';
  const dataDir = isAbsolute(dataDirEnv) ? dataDirEnv : join(process.cwd(), dataDirEnv);
  const dbPath = join(dataDir, 'nous.sqlite');

  const documentStore = new SqliteDocumentStore(dbPath);
  const vectorStore = new SqliteVectorStore(dbPath);
  const embedder = new InMemoryEmbedder();
  const stmStore = new DocumentStmStore(documentStore, {
    compactionPolicy: resolveStmCompactionPolicy(resolvedConfig),
  });
  const projectStore = new DocumentProjectStore(documentStore);
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
  const Cortex = new PfcEngine(config, toolExecutor);
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

  const router = new ModelRouter(config);
  const providerRegistry = new ProviderRegistry(config);
  const workflowEngine = new DeterministicWorkflowEngine({
    pfcEngine: Cortex,
    modelRouter: router,
    toolExecutor,
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
  const maoProjectionService = new MaoProjectionService({
    opctlService,
    workflowEngine,
    escalationService,
    schedulerService,
    voiceControlService,
    witnessService,
  });

  const getProvider = (id: ProviderId) => {
    // Explicitly route the synthetic fallback provider to the in-process mock.
    // This prevents accidental Ollama resolution for the mock config path.
    if (id === MOCK_PROVIDER_ID) {
      return createMockProvider(id) as ReturnType<typeof providerRegistry.getProvider>;
    }
    return providerRegistry.getProvider(id);
  };

  const cfg = resolvedConfig as {
    security?: { traceSensitiveData?: boolean };
  };
  const traceSensitiveData = cfg.security?.traceSensitiveData ?? false;

  const createGatewayProjectApi = (projectId: ProjectId): IProjectApi => ({
    memory: {
      read: async () => [],
      write: async (candidate) => mwcPipeline.submit(candidate, projectId),
      retrieve: async () => [],
    },
    model: {
      invoke: async (role: ModelRole, input: unknown) => {
        const traceId = randomUUID() as TraceId;
        const route = await router.routeWithEvidence(role, {
          projectId,
          traceId,
          modelRequirements: {
            profile: 'review-standard',
            fallbackPolicy: 'block_if_unmet',
          },
        });
        const provider = getProvider(route.providerId);
        if (!provider) {
          throw new Error(`Provider ${route.providerId} not found`);
        }
        return provider.invoke({ role, input, projectId, traceId });
      },
      stream: async function* (role: ModelRole, input: unknown) {
        const traceId = randomUUID() as TraceId;
        const route = await router.routeWithEvidence(role, {
          projectId,
          traceId,
          modelRequirements: {
            profile: 'review-standard',
            fallbackPolicy: 'block_if_unmet',
          },
        });
        const provider = getProvider(route.providerId);
        if (!provider) {
          throw new Error(`Provider ${route.providerId} not found`);
        }
        yield* provider.stream({ role, input, projectId, traceId });
      },
    },
    tool: {
      execute: async (name, params) => toolExecutor.execute(name, params, projectId),
      list: async (capabilities) => {
        const tools = await toolExecutor.listTools();
        if (!capabilities || capabilities.length === 0) {
          return tools;
        }
        return tools.filter((tool) =>
          capabilities.every((capability) => tool.capabilities.includes(capability)),
        );
      },
    },
    artifact: {
      store: async (data) => artifactStore.store({ ...data, projectId }),
      retrieve: async (request) => artifactStore.retrieve({ ...request, projectId }),
      list: async (filters) => artifactStore.list(projectId, filters),
      delete: async (request) => artifactStore.delete({ ...request, projectId }),
    },
    escalation: {
      notify: async (channel, message) =>
        escalationService.notify({
          projectId,
          channel,
          priority: 'medium',
          timestamp: new Date().toISOString(),
          triggerReason: 'gateway_runtime_notify',
          requiredAction: 'Gateway runtime escalation',
          context: message,
        }),
      request: async (decision) => {
        const escalationId = await escalationService.notify(decision);
        return {
          escalationId,
          action: 'notified',
          message: decision.context,
          respondedAt: new Date().toISOString(),
          channel: decision.channel,
        };
      },
    },
    scheduler: {
      register: async (schedule) => schedulerService.register({ ...schedule, projectId }),
      cancel: async (id) => schedulerService.cancel(id),
    },
    project: {
      config: () =>
        ({
          id: projectId,
          name: `Project ${projectId}`,
          type: 'software_project',
          pfcTier: 'standard',
          governanceDefaults: {
            defaultNodeGovernance: 'must',
            requireExplicitReviewForShouldDeviation: true,
            blockedActionFeedbackMode: 'reason_coded',
          },
          modelAssignments: undefined,
          memoryAccessPolicy: {
            globalRead: [],
            globalWrite: [],
            projectPolicies: [],
            defaultPolicy: {
              canReadFrom: ['self'],
              canBeReadBy: ['self'],
              inheritsGlobal: true,
            },
          },
          escalationChannels: ['in_app'],
          escalationPreferences: {
            routeByPriority: {
              low: ['projects'],
              medium: ['projects'],
              high: ['projects', 'chat', 'mobile'],
              critical: ['projects', 'chat', 'mao', 'mobile'],
            },
            acknowledgementSurfaces: ['projects', 'chat', 'mobile'],
            mirrorToChat: true,
          },
          workflow: {
            definitions: [],
          },
          packageDefaultIntake: [],
          retrievalBudgetTokens: 500,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }) as any,
      state: () =>
        ({
          status: 'active',
          activeWorkflows: 0,
          lastActivityAt: new Date().toISOString(),
        }) as any,
      log: () => undefined,
    },
  });

  const coreExecutor = new CoreExecutor({
    Cortex,
    router,
    getProvider,
    toolExecutor,
    stmStore,
    mwcPipeline,
    projectStore,
    documentStore,
    witnessService,
    opctlService,
    policyEngine,
    traceSensitiveData,
  });

  const gatewayRuntime = createPrincipalSystemGatewayRuntime({
    modelRouter: router,
    getProvider: (providerId) => getProvider(providerId as ProviderId),
    getProjectApi: (projectId: ProjectId) => createGatewayProjectApi(projectId),
    toolExecutor,
    pfc: Cortex,
    workflowEngine,
    projectStore,
    scheduler: schedulerService,
    escalationService,
    witnessService,
    outputSchemaValidator: new PassthroughOutputSchemaValidator(),
  });
  schedulerIngressGateway = new GatewayRuntimeIngressAdapter(gatewayRuntime);

  cachedContext = {
    coreExecutor,
    gatewayRuntime,
    projectStore,
    stmStore,
    mwcPipeline,
    documentStore,
    config,
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
    nudgeDiscoveryService,
    voiceControlService,
    dataDir,
  };

  console.log('[nous:web] bootstrap complete');
  return cachedContext;
}
