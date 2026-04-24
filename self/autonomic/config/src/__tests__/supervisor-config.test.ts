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

// WR-162 SP 6 (SUPV-SP6-014) — UT-AC1 sentinelThresholds parsing.
describe('SupervisorBootstrapConfigSchema.sentinelThresholds (SP 6)', () => {
  it('parses an empty config to default thresholds (all six fields populated)', () => {
    const result = SupervisorBootstrapConfigSchema.parse({});
    expect(result.sentinelThresholds).toEqual({
      retryCountPerWindow: 10,
      retryWindowSeconds: 60,
      escalationCountPerWindow: 3,
      escalationWindowSeconds: 60,
      stalledAgentIdleSeconds: 300,
      heartbeatIntervalMs: 5000,
    });
  });

  it('accepts a partial override (heartbeatIntervalMs)', () => {
    const result = SupervisorBootstrapConfigSchema.parse({
      sentinelThresholds: { heartbeatIntervalMs: 1000 },
    });
    expect(result.sentinelThresholds.heartbeatIntervalMs).toBe(1000);
    expect(result.sentinelThresholds.retryCountPerWindow).toBe(10);
    expect(result.sentinelThresholds.stalledAgentIdleSeconds).toBe(300);
  });

  it('rejects a negative retryCountPerWindow', () => {
    expect(
      SupervisorBootstrapConfigSchema.safeParse({
        sentinelThresholds: { retryCountPerWindow: -1 },
      }).success,
    ).toBe(false);
  });

  it('rejects zero heartbeatIntervalMs (positive means > 0)', () => {
    expect(
      SupervisorBootstrapConfigSchema.safeParse({
        sentinelThresholds: { heartbeatIntervalMs: 0 },
      }).success,
    ).toBe(false);
  });

  it('rejects a non-integer retryCountPerWindow', () => {
    expect(
      SupervisorBootstrapConfigSchema.safeParse({
        sentinelThresholds: { retryCountPerWindow: 1.5 },
      }).success,
    ).toBe(false);
  });
});
