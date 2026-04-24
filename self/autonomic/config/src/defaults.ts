/**
 * Default configuration values for Nous-OSS.
 *
 * Cortex tier presets derived from Cortex-mode-capability-matrix.mdx.
 * Profiles, defaults, and starter system configuration.
 */
import type { PfcTierPreset, Profile, SystemConfig } from './schema.js';

// --- Cortex Tier Presets ---
// From Cortex-mode-capability-matrix.mdx.
export const DEFAULT_PFC_TIER_PRESETS: PfcTierPreset[] = [
  {
    tier: 0,
    name: 'Off',
    description: 'No orchestration. Direct model interaction.',
    reflection: 'none',
    memoryGating: false,
    toolAuthorization: false,
    planning: false,
    escalationDetection: false,
    targetModelClass: 'any',
  },
  {
    tier: 1,
    name: 'Mobile',
    description:
      'Single-pass routing, minimal reflection, lightweight memory triage.',
    reflection: 'minimal',
    memoryGating: true,
    toolAuthorization: false,
    planning: false,
    escalationDetection: false,
    targetModelClass: '1-4B',
  },
  {
    tier: 2,
    name: 'Low Spec PC',
    description:
      'Reliable routing, basic reflection, controlled memory candidate generation.',
    reflection: 'basic',
    memoryGating: true,
    toolAuthorization: true,
    planning: false,
    escalationDetection: false,
    targetModelClass: '5-8B',
  },
  {
    tier: 3,
    name: 'Mid Spec PC',
    description:
      'Two-pass reflection, better escalation detection, structured memory validation.',
    reflection: 'two-pass',
    memoryGating: true,
    toolAuthorization: true,
    planning: false,
    escalationDetection: true,
    targetModelClass: '10-14B',
  },
  {
    tier: 4,
    name: 'High Spec PC',
    description:
      'Multi-pass reflection, deep planning, strong conflict detection.',
    reflection: 'multi-pass',
    memoryGating: true,
    toolAuthorization: true,
    planning: true,
    escalationDetection: true,
    targetModelClass: '20B+',
  },
  {
    tier: 5,
    name: 'Remote Agent',
    description:
      'Highest reasoning depth, advanced reflection, full orchestration strength.',
    reflection: 'advanced',
    memoryGating: true,
    toolAuthorization: true,
    planning: true,
    escalationDetection: true,
    targetModelClass: 'remote',
  },
];

// --- Default Profiles (legacy + canonical, Phase 2.3) ---
export const DEFAULT_PROFILES: Record<string, Profile> = {
  'local-only': {
    name: 'local-only',
    description: 'All models run locally. Maximum privacy.',
    defaultProviderType: 'local',
    allowLocalProviders: true,
    allowRemoteProviders: false,
    allowSilentLocalToRemoteFailover: false,
  },
  'remote-only': {
    name: 'remote-only',
    description: 'All models run remotely. Maximum capability.',
    defaultProviderType: 'remote',
    allowLocalProviders: false,
    allowRemoteProviders: true,
    allowSilentLocalToRemoteFailover: false,
  },
  hybrid: {
    name: 'hybrid',
    description: 'Mix of local and remote models. Balanced.',
    defaultProviderType: 'local',
    allowLocalProviders: true,
    allowRemoteProviders: true,
    allowSilentLocalToRemoteFailover: false,
  },
  local_strict: {
    name: 'local_strict',
    description: 'Local providers only. No silent local-to-remote failover.',
    defaultProviderType: 'local',
    allowLocalProviders: true,
    allowRemoteProviders: false,
    allowSilentLocalToRemoteFailover: false,
  },
  hybrid_controlled: {
    name: 'hybrid_controlled',
    description: 'Local preferred with explicit remote fallback under policy.',
    defaultProviderType: 'local',
    allowLocalProviders: true,
    allowRemoteProviders: true,
    allowSilentLocalToRemoteFailover: false,
  },
  remote_primary: {
    name: 'remote_primary',
    description: 'Remote providers primary. Local only when explicitly configured.',
    defaultProviderType: 'remote',
    allowLocalProviders: false,
    allowRemoteProviders: true,
    allowSilentLocalToRemoteFailover: false,
  },
};

// --- Default System Configuration ---
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = {
  profile: DEFAULT_PROFILES['local-only']!,
  pfcTier: 2,
  pfcTierPresets: DEFAULT_PFC_TIER_PRESETS,
  modelRoleAssignments: [],
  providers: [],
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
    dataDir: './data',
    documentBackend: 'sqlite',
    vectorBackend: 'stub',
    graphBackend: 'stub',
    storageEncryption: false,
  },
  security: {
    traceSensitiveData: false,
  },
  logging: {
    level: 0, // LogLevel.Debug
    channels: {},
  },
  cost: {
    enforcementEnabled: false,
  },
};
