/**
 * Generate default Nous config with Ollama provider.
 */
import {
  DEFAULT_PFC_TIER_PRESETS,
  DEFAULT_PROFILES,
  SystemConfigSchema,
  type SystemConfig,
} from '@nous/autonomic-config';

const OLLAMA_PROVIDER_ID = 'ollama-default';

export function generateDefaultConfig(
  dataDir: string,
  modelId: string,
): SystemConfig {
  const config: SystemConfig = {
    profile: DEFAULT_PROFILES['local-only']!,
    pfcTier: 2,
    pfcTierPresets: DEFAULT_PFC_TIER_PRESETS,
    modelRoleAssignments: [
      { role: 'reasoner', providerId: OLLAMA_PROVIDER_ID },
    ],
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
      escalationChannels: ['in-app'],
    },
    storage: {
      dataDir,
      documentBackend: 'sqlite',
      vectorBackend: 'stub',
      graphBackend: 'stub',
    },
  };

  return SystemConfigSchema.parse(config);
}
