import { describe, expect, it } from 'vitest';
import {
  SupervisorBootstrapConfigSchema,
  SystemConfigSchema,
} from '../schema.js';
import { DEFAULT_SYSTEM_CONFIG } from '../defaults.js';

describe('SupervisorBootstrapConfigSchema', () => {
  it('defaults enabled to true for an empty object', () => {
    const result = SupervisorBootstrapConfigSchema.parse({});
    expect(result.enabled).toBe(true);
  });

  it('parses { enabled: true }', () => {
    const result = SupervisorBootstrapConfigSchema.parse({ enabled: true });
    expect(result.enabled).toBe(true);
  });

  it('parses { enabled: false }', () => {
    const result = SupervisorBootstrapConfigSchema.parse({ enabled: false });
    expect(result.enabled).toBe(false);
  });

  it('rejects a non-boolean enabled', () => {
    expect(
      SupervisorBootstrapConfigSchema.safeParse({ enabled: 'yes' }).success,
    ).toBe(false);
  });
});

describe('SystemConfigSchema — supervisor slot', () => {
  it('defaults supervisor.enabled to true when the supervisor key is absent', () => {
    const { supervisor: _supervisor, ...withoutSupervisor } =
      DEFAULT_SYSTEM_CONFIG;
    const result = SystemConfigSchema.parse(withoutSupervisor);
    expect(result.supervisor.enabled).toBe(true);
  });

  it('accepts an explicit supervisor override', () => {
    const result = SystemConfigSchema.parse({
      ...DEFAULT_SYSTEM_CONFIG,
      supervisor: { enabled: false },
    });
    expect(result.supervisor.enabled).toBe(false);
  });

  it('injects supervisor.enabled === true when supervisor is an empty object', () => {
    const result = SystemConfigSchema.parse({
      ...DEFAULT_SYSTEM_CONFIG,
      supervisor: {},
    });
    expect(result.supervisor.enabled).toBe(true);
  });
});

describe('DEFAULT_SYSTEM_CONFIG.supervisor', () => {
  it('ships with supervisor.enabled === true', () => {
    expect(DEFAULT_SYSTEM_CONFIG.supervisor.enabled).toBe(true);
  });
});
