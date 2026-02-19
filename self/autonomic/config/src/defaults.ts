/**
 * Default configuration values for Nous-OSS.
 *
 * PFC tier presets derived from pfc-mode-capability-matrix.mdx.
 * Profiles, defaults, and starter system configuration.
 */
import type { PfcTierPreset, Profile, SystemConfig } from './schema.js';

// --- PFC Tier Presets ---
// From pfc-mode-capability-matrix.mdx.
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

// --- Default Profiles ---
export const DEFAULT_PROFILES: Record<string, Profile> = {
  'local-only': {
    name: 'local-only',
    description: 'All models run locally. Maximum privacy.',
    defaultProviderType: 'local',
    allowLocalProviders: true,
    allowRemoteProviders: false,
  },
  'remote-only': {
    name: 'remote-only',
    description: 'All models run remotely. Maximum capability.',
    defaultProviderType: 'remote',
    allowLocalProviders: false,
    allowRemoteProviders: true,
  },
  hybrid: {
    name: 'hybrid',
    description: 'Mix of local and remote models. Balanced.',
    defaultProviderType: 'local',
    allowLocalProviders: true,
    allowRemoteProviders: true,
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
};
