/**
 * Bootstrap — wires the Nous stack for the web app.
 *
 * Creates document store, STM, projects, MWC pipeline, PFC, router,
 * providers, and core executor. Uses NOUS_DATA_DIR and NOUS_CONFIG_PATH env.
 */
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ProviderId, TraceId } from '@nous/shared';
import { ConfigManager } from '@nous/autonomic-config';
import { SqliteDocumentStore } from '@nous/autonomic-storage';
import { DocumentStmStore } from '@nous/memory-stm';
import { MwcPipeline } from '@nous/memory-mwc';
import { PfcEngine, createPfcEvaluator } from '@nous/cortex-pfc';
import { CoreExecutor } from '@nous/cortex-core';
import { DocumentProjectStore } from '@nous/subcortex-projects';
import { ModelRouter } from '@nous/subcortex-router';
import { ProviderRegistry } from '@nous/subcortex-providers';
import { ToolExecutor } from '@nous/subcortex-tools';
import type { NousContext } from './context';

const DATA_DIR = process.env.NOUS_DATA_DIR ?? './data';
const CONFIG_PATH = process.env.NOUS_CONFIG_PATH;

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

let cachedContext: NousContext | null = null;

export function clearNousContextCache(): void {
  cachedContext = null;
}

export function createNousContext(): NousContext {
  if (cachedContext) {
    return cachedContext;
  }

  const baseConfig = new ConfigManager({ configPath: CONFIG_PATH });
  const config = configWithFallback(baseConfig) as typeof baseConfig;
  const dataDir = join(process.cwd(), DATA_DIR);
  const dbPath = join(dataDir, 'nous.sqlite');

  const documentStore = new SqliteDocumentStore(dbPath);
  const stmStore = new DocumentStmStore(documentStore);
  const projectStore = new DocumentProjectStore(documentStore);

  const toolExecutor = new ToolExecutor();
  const pfc = new PfcEngine(config, toolExecutor);
  const mwcPipeline = new MwcPipeline(
    documentStore,
    stmStore,
    createPfcEvaluator(pfc),
  );

  const router = new ModelRouter(config);
  const providerRegistry = new ProviderRegistry(config);

  const getProvider = (id: ProviderId) => {
    const provider = providerRegistry.getProvider(id);
    if (provider) return provider;
    return createMockProvider(id) as ReturnType<typeof providerRegistry.getProvider>;
  };

  const coreExecutor = new CoreExecutor({
    pfc,
    router,
    getProvider,
    toolExecutor,
    stmStore,
    mwcPipeline,
    projectStore,
    documentStore,
  });

  cachedContext = {
    coreExecutor,
    projectStore,
    stmStore,
    mwcPipeline,
    documentStore,
    config,
    router,
    getProvider,
  };

  console.log('[nous:web] bootstrap complete');
  return cachedContext;
}
