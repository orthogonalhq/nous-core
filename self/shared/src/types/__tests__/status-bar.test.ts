import { describe, expect, it } from 'vitest';
import {
  StatusBarActiveAgentsSchema,
  StatusBarBackpressureSchema,
  StatusBarBudgetSchema,
  StatusBarCognitiveProfileSchema,
  StatusBarSnapshotSchema,
} from '../status-bar.js';

describe('StatusBarBackpressureSchema', () => {
  it('parses a valid payload', () => {
    expect(
      StatusBarBackpressureSchema.safeParse({
        state: 'nominal',
        queueDepth: 0,
        activeAgents: 0,
      }).success,
    ).toBe(true);
  });

  it('rejects a negative queueDepth', () => {
    expect(
      StatusBarBackpressureSchema.safeParse({
        state: 'nominal',
        queueDepth: -1,
        activeAgents: 0,
      }).success,
    ).toBe(false);
  });

  it('rejects a non-enum state', () => {
    expect(
      StatusBarBackpressureSchema.safeParse({
        state: 'melted',
        queueDepth: 0,
        activeAgents: 0,
      }).success,
    ).toBe(false);
  });
});

describe('StatusBarCognitiveProfileSchema', () => {
  it('parses a valid payload', () => {
    expect(
      StatusBarCognitiveProfileSchema.safeParse({
        name: 'Balanced',
        profileId: 'balanced',
      }).success,
    ).toBe(true);
  });

  it('rejects a missing field', () => {
    expect(
      StatusBarCognitiveProfileSchema.safeParse({
        name: 'Balanced',
      }).success,
    ).toBe(false);
  });
});

describe('StatusBarBudgetSchema', () => {
  it('parses a valid payload', () => {
    expect(
      StatusBarBudgetSchema.safeParse({
        state: 'nominal',
        spent: 0,
        ceiling: 100,
        period: '2026-04',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-enum state', () => {
    expect(
      StatusBarBudgetSchema.safeParse({
        state: 'bad',
        spent: 0,
        ceiling: 100,
        period: '2026-04',
      }).success,
    ).toBe(false);
  });

  it('rejects a negative spent value', () => {
    expect(
      StatusBarBudgetSchema.safeParse({
        state: 'nominal',
        spent: -0.01,
        ceiling: 100,
        period: '2026-04',
      }).success,
    ).toBe(false);
  });
});

describe('StatusBarActiveAgentsSchema', () => {
  it('parses a valid payload', () => {
    expect(
      StatusBarActiveAgentsSchema.safeParse({
        count: 0,
        status: 'idle',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-integer count', () => {
    expect(
      StatusBarActiveAgentsSchema.safeParse({
        count: 1.5,
        status: 'idle',
      }).success,
    ).toBe(false);
  });
});

describe('StatusBarSnapshotSchema', () => {
  const validSnapshot = {
    backpressure: {
      state: 'nominal' as const,
      queueDepth: 0,
      activeAgents: 0,
    },
    cognitiveProfile: { name: 'Balanced', profileId: 'balanced' },
    budget: {
      state: 'nominal' as const,
      spent: 0,
      ceiling: 100,
      period: '2026-04',
    },
    activeAgents: { count: 0, status: 'idle' as const },
  };

  it('parses a fully populated snapshot', () => {
    expect(StatusBarSnapshotSchema.safeParse(validSnapshot).success).toBe(true);
  });

  it('accepts null for backpressure slot', () => {
    expect(
      StatusBarSnapshotSchema.safeParse({
        ...validSnapshot,
        backpressure: null,
      }).success,
    ).toBe(true);
  });

  it('accepts null for cognitiveProfile slot', () => {
    expect(
      StatusBarSnapshotSchema.safeParse({
        ...validSnapshot,
        cognitiveProfile: null,
      }).success,
    ).toBe(true);
  });

  it('accepts null for budget slot', () => {
    expect(
      StatusBarSnapshotSchema.safeParse({
        ...validSnapshot,
        budget: null,
      }).success,
    ).toBe(true);
  });

  it('accepts null for activeAgents slot', () => {
    expect(
      StatusBarSnapshotSchema.safeParse({
        ...validSnapshot,
        activeAgents: null,
      }).success,
    ).toBe(true);
  });

  it('accepts all slots null', () => {
    expect(
      StatusBarSnapshotSchema.safeParse({
        backpressure: null,
        cognitiveProfile: null,
        budget: null,
        activeAgents: null,
      }).success,
    ).toBe(true);
  });

  it('rejects a missing backpressure key (.nullable() not .optional())', () => {
    const { backpressure: _, ...missing } = validSnapshot;
    expect(StatusBarSnapshotSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects a missing cognitiveProfile key', () => {
    const { cognitiveProfile: _, ...missing } = validSnapshot;
    expect(StatusBarSnapshotSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects a missing budget key', () => {
    const { budget: _, ...missing } = validSnapshot;
    expect(StatusBarSnapshotSchema.safeParse(missing).success).toBe(false);
  });

  it('rejects a missing activeAgents key', () => {
    const { activeAgents: _, ...missing } = validSnapshot;
    expect(StatusBarSnapshotSchema.safeParse(missing).success).toBe(false);
  });
});
