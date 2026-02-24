import { describe, it, expect } from 'vitest';
import { SystemConfigSchema } from '../schema.js';
import { DEFAULT_SYSTEM_CONFIG } from '../defaults.js';

describe('SystemConfigSchema', () => {
  it('validates the default system config', () => {
    const result = SystemConfigSchema.safeParse(DEFAULT_SYSTEM_CONFIG);
    expect(result.success).toBe(true);
  });

  it('rejects missing profile', () => {
    const { profile: _, ...noProfile } = DEFAULT_SYSTEM_CONFIG;
    const result = SystemConfigSchema.safeParse(noProfile);
    expect(result.success).toBe(false);
  });

  it('rejects invalid Cortex tier (6)', () => {
    const result = SystemConfigSchema.safeParse({
      ...DEFAULT_SYSTEM_CONFIG,
      pfcTier: 6,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative Cortex tier (-1)', () => {
    const result = SystemConfigSchema.safeParse({
      ...DEFAULT_SYSTEM_CONFIG,
      pfcTier: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid profile name', () => {
    const result = SystemConfigSchema.safeParse({
      ...DEFAULT_SYSTEM_CONFIG,
      profile: {
        ...DEFAULT_SYSTEM_CONFIG.profile,
        name: 'invalid-profile',
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid provider type in providers array', () => {
    const result = SystemConfigSchema.safeParse({
      ...DEFAULT_SYSTEM_CONFIG,
      providers: [{
        id: 'test',
        name: 'Test',
        type: 'audio',
        modelId: 'test-model',
        isLocal: true,
        capabilities: [],
      }],
    });
    expect(result.success).toBe(false);
  });

  it('applies defaults for optional fields', () => {
    const result = SystemConfigSchema.safeParse({
      ...DEFAULT_SYSTEM_CONFIG,
      defaults: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.defaults.projectType).toBe('hybrid');
      expect(result.data.defaults.governance).toBe('should');
      expect(result.data.defaults.retrievalBudgetTokens).toBe(500);
    }
  });

  it('rejects non-positive retrieval budget', () => {
    const result = SystemConfigSchema.safeParse({
      ...DEFAULT_SYSTEM_CONFIG,
      defaults: {
        ...DEFAULT_SYSTEM_CONFIG.defaults,
        retrievalBudgetTokens: 0,
      },
    });
    expect(result.success).toBe(false);
  });
});
