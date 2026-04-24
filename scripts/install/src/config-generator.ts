/**
 * Generate default Nous config with Ollama provider.
 */
import {
  DEFAULT_PFC_TIER_PRESETS,
  DEFAULT_PROFILES,
  SystemConfigSchema,
  type SystemConfig,
} from '@nous/autonomic-config';

type ProviderId = SystemConfig['providers'][number]['id'];
const OLLAMA_PROVIDER_ID = '6f4b38b4-e5d0-4c91-9e4b-f7f3f7f8a5ce' as ProviderId;

export function generateDefaultConfig(
  dataDir: string,
  modelId: string,
): SystemConfig {
  const config: SystemConfig = {
    profile: DEFAULT_PROFILES['local-only']!,
    pfcTier: 2,
    pfcTierPresets: DEFAULT_PFC_TIER_PRESETS,
    modelRoleAssignments: [{ role: 'cortex-chat', providerId: OLLAMA_PROVIDER_ID }],
    providers: [
      {
        id: OLLAMA_PROVIDER_ID,
        name: 'Ollama',
        type: 'text',
        modelId,
        isLocal: true,
        capabilities: [],
      },
    ],
    defaults: {
      projectType: 'hybrid',
      governance: 'should',
      memoryAccessPolicy: {
        canReadFrom: 'all',
        canBeReadBy: 'all',
        inheritsGlobal: true,
      },
      retrievalBudgetTokens: 500,
      stmCompactionPolicy: {
        maxContextTokens: 1024,
        targetContextTokens: 640,
        minEntriesBeforeCompaction: 8,
        retainedRecentEntries: 4,
      },
      escalationChannels: ['in-app'],
    },
    storage: {
      dataDir,
      documentBackend: 'sqlite',
      vectorBackend: 'stub',
      graphBackend: 'stub',
      storageEncryption: false,
    },
    security: {
      traceSensitiveData: false,
    },
    logging: {
      level: 0,
      channels: {},
    },
    cost: {
      enforcementEnabled: false,
    },
  };

  return SystemConfigSchema.parse(config);
}
