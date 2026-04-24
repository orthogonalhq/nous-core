import { describe, expect, it } from 'vitest';
import { CostConfigSchema, SystemConfigSchema } from '../schema.js';
import { DEFAULT_SYSTEM_CONFIG } from '../defaults.js';

describe('CostConfigSchema', () => {
  it('parses { enforcementEnabled: true }', () => {
    const result = CostConfigSchema.parse({ enforcementEnabled: true });
    expect(result.enforcementEnabled).toBe(true);
  });

  it('parses { enforcementEnabled: false }', () => {
    const result = CostConfigSchema.parse({ enforcementEnabled: false });
    expect(result.enforcementEnabled).toBe(false);
  });

  it('defaults enforcementEnabled to false for an empty object', () => {
    const result = CostConfigSchema.parse({});
    expect(result.enforcementEnabled).toBe(false);
  });

  it('rejects a non-boolean enforcementEnabled', () => {
    expect(
      CostConfigSchema.safeParse({ enforcementEnabled: 'yes' }).success,
    ).toBe(false);
  });
});

describe('SystemConfigSchema — cost slot', () => {
  it('defaults cost.enforcementEnabled to false when the cost key is absent', () => {
    const { cost: _, ...withoutCost } = DEFAULT_SYSTEM_CONFIG;
    const result = SystemConfigSchema.parse(withoutCost);
    expect(result.cost.enforcementEnabled).toBe(false);
  });

  it('accepts an explicit cost override', () => {
    const result = SystemConfigSchema.parse({
      ...DEFAULT_SYSTEM_CONFIG,
      cost: { enforcementEnabled: true },
    });
    expect(result.cost.enforcementEnabled).toBe(true);
  });
});

describe('DEFAULT_SYSTEM_CONFIG.cost', () => {
  it('ships with cost.enforcementEnabled === false', () => {
    expect(DEFAULT_SYSTEM_CONFIG.cost.enforcementEnabled).toBe(false);
  });
});
