/**
 * UT-D4 — SUP-004 detector unit tests.
 */
import { describe, expect, it } from 'vitest';
import { detectSup004MissingAuthEvidence } from '../../detection/sup-004-missing-auth-evidence.js';
import { baseObservation, buildContext } from './test-helpers.js';

describe('SUP-004 — missing authorization evidence', () => {
  it('returns S1 candidate when no auth event exists for the claimed action', async () => {
    const result = await detectSup004MissingAuthEvidence(
      baseObservation({
        actionClaim: {
          actionCategory: 'opctl-command',
          actionRef: 'operator.pause_run#abc',
        },
      }),
      buildContext({
        witness: {
          verify: async () => ({}) as never,
          hasAuthorizationForAction: async () => false,
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-004');
    expect(result?.severity).toBe('S1');
  });

  it('returns null when auth event exists', async () => {
    const result = await detectSup004MissingAuthEvidence(
      baseObservation({
        actionClaim: {
          actionCategory: 'opctl-command',
          actionRef: 'operator.pause_run#abc',
        },
      }),
      buildContext({
        witness: {
          verify: async () => ({}) as never,
          hasAuthorizationForAction: async () => true,
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when actionClaim is null (contract-grounded no-fire)', async () => {
    const result = await detectSup004MissingAuthEvidence(
      baseObservation({ actionClaim: null }),
      buildContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null when action category is supervisor-authored (adjacent)', async () => {
    const result = await detectSup004MissingAuthEvidence(
      baseObservation({
        actionClaim: {
          actionCategory: 'supervisor-detection',
          actionRef: 'SUP-001-run1',
        },
      }),
      buildContext({
        witness: {
          verify: async () => ({}) as never,
          hasAuthorizationForAction: async () => false,
        },
      }),
    );
    expect(result).toBeNull();
  });
});
