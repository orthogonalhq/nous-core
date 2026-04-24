/**
 * UT-DC1 — DetectorContext factory: freeze + verify memoisation.
 */
import { describe, expect, it, vi } from 'vitest';
import type { IWitnessService } from '@nous/shared';
import { createDetectorContextFactory } from '../detector-context.js';
import { baseObservation, passingVerify } from './detection/test-helpers.js';

describe('DetectorContext factory', () => {
  it('returns a frozen context', () => {
    const witnessService = {
      verify: vi.fn(async () => passingVerify()),
      appendInvariant: vi.fn(),
      appendAuthorization: vi.fn(),
      appendCompletion: vi.fn(),
      createCheckpoint: vi.fn(),
      rotateKeyEpoch: vi.fn(),
      getReport: vi.fn(),
      listReports: vi.fn(),
      getLatestCheckpoint: vi.fn(),
    } as unknown as IWitnessService;
    const factory = createDetectorContextFactory({ witnessService });
    const context = factory(baseObservation());
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.witness)).toBe(true);
  });

  it('memoises verify() within a single context (one call regardless of N invocations)', async () => {
    const verifyMock = vi.fn(async () => passingVerify());
    const witnessService = {
      verify: verifyMock,
      appendInvariant: vi.fn(),
      appendAuthorization: vi.fn(),
      appendCompletion: vi.fn(),
      createCheckpoint: vi.fn(),
      rotateKeyEpoch: vi.fn(),
      getReport: vi.fn(),
      listReports: vi.fn(),
      getLatestCheckpoint: vi.fn(),
    } as unknown as IWitnessService;
    const factory = createDetectorContextFactory({ witnessService });
    const context = factory(baseObservation());
    await context.witness.verify();
    await context.witness.verify();
    await context.witness.verify();
    expect(verifyMock).toHaveBeenCalledTimes(1);
  });

  it('toolSurface is populated when observation has agentClass', () => {
    const witnessService = {
      verify: vi.fn(async () => passingVerify()),
      appendInvariant: vi.fn(),
      appendAuthorization: vi.fn(),
      appendCompletion: vi.fn(),
      createCheckpoint: vi.fn(),
      rotateKeyEpoch: vi.fn(),
      getReport: vi.fn(),
      listReports: vi.fn(),
      getLatestCheckpoint: vi.fn(),
    } as unknown as IWitnessService;
    const factory = createDetectorContextFactory({ witnessService });
    const context = factory(baseObservation({ agentClass: 'Worker' }));
    expect(context.toolSurface).not.toBeNull();
    expect(context.toolSurface?.agentClass).toBe('Worker');
  });

  it('toolSurface is null when observation has no agentClass', () => {
    const witnessService = {
      verify: vi.fn(async () => passingVerify()),
      appendInvariant: vi.fn(),
      appendAuthorization: vi.fn(),
      appendCompletion: vi.fn(),
      createCheckpoint: vi.fn(),
      rotateKeyEpoch: vi.fn(),
      getReport: vi.fn(),
      listReports: vi.fn(),
      getLatestCheckpoint: vi.fn(),
    } as unknown as IWitnessService;
    const factory = createDetectorContextFactory({ witnessService });
    const context = factory(baseObservation({ agentClass: null }));
    expect(context.toolSurface).toBeNull();
  });
});
