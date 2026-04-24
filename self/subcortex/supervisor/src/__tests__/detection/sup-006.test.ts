/**
 * UT-D6 — SUP-006 detector unit tests.
 */
import { describe, expect, it } from 'vitest';
import { detectSup006SpawnCeiling } from '../../detection/sup-006-spawn-ceiling.js';
import { baseObservation, buildContext } from './test-helpers.js';

describe('SUP-006 — spawn ceiling breach', () => {
  it('returns S1 candidate when tracker.spawnBudgetExceeded is true', async () => {
    const result = await detectSup006SpawnCeiling(
      baseObservation(),
      buildContext({
        budget: {
          getExhaustedReason: () => null,
          getSpawnBudgetExceeded: () => true,
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-006');
    expect(result?.severity).toBe('S1');
  });

  it('returns null when tracker reports spawnBudgetExceeded false', async () => {
    const result = await detectSup006SpawnCeiling(
      baseObservation(),
      buildContext({
        budget: {
          getExhaustedReason: () => null,
          getSpawnBudgetExceeded: () => false,
        },
      }),
    );
    expect(result).toBeNull();
  });

  it('returns null when context.budget is null (adjacent)', async () => {
    const result = await detectSup006SpawnCeiling(
      baseObservation(),
      buildContext({ budget: null }),
    );
    expect(result).toBeNull();
  });
});
