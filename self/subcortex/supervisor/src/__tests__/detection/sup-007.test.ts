/**
 * UT-D7 — SUP-007 detector unit tests.
 */
import { describe, expect, it } from 'vitest';
import type { VerificationReport } from '@nous/shared';
import { detectSup007WitnessChainBreak } from '../../detection/sup-007-witness-chain-break.js';
import { baseObservation, buildContext, passingVerify } from './test-helpers.js';

function brokenReport(overrides: Partial<VerificationReport['ledger']>): VerificationReport {
  const base = passingVerify();
  return {
    ...base,
    status: 'fail',
    ledger: { ...base.ledger, ...overrides },
  };
}

describe('SUP-007 — witness hash-chain break', () => {
  it('returns S0 candidate when ledger.hashChainValid is false', async () => {
    const result = await detectSup007WitnessChainBreak(
      baseObservation(),
      buildContext({
        witness: {
          verify: async () => brokenReport({ hashChainValid: false }),
          hasAuthorizationForAction: async () => false,
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-007');
    expect(result?.severity).toBe('S0');
  });

  it('returns S0 candidate when checkpoints are broken', async () => {
    const base = passingVerify();
    const report: VerificationReport = {
      ...base,
      status: 'fail',
      checkpoints: { ...base.checkpoints, checkpointChainValid: false },
    };
    const result = await detectSup007WitnessChainBreak(
      baseObservation(),
      buildContext({
        witness: {
          verify: async () => report,
          hasAuthorizationForAction: async () => false,
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-007');
  });

  it('returns null when verify status is pass', async () => {
    const result = await detectSup007WitnessChainBreak(
      baseObservation(),
      buildContext({
        witness: {
          verify: async () => passingVerify(),
          hasAuthorizationForAction: async () => false,
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when status is review but integrity booleans are all true (adjacent)', async () => {
    const base = passingVerify();
    const report: VerificationReport = { ...base, status: 'review' };
    const result = await detectSup007WitnessChainBreak(
      baseObservation(),
      buildContext({
        witness: {
          verify: async () => report,
          hasAuthorizationForAction: async () => false,
        },
      }),
    );
    expect(result).toBeNull();
  });
});
