/**
 * UT-D5 — SUP-005 detector unit tests.
 */
import { describe, expect, it } from 'vitest';
import { detectSup005BudgetExhausted } from '../../detection/sup-005-budget-exhausted.js';
import { baseObservation, buildContext } from './test-helpers.js';

describe('SUP-005 — budget exhausted', () => {
  it('returns S1 candidate when tracker reports token_budget exhaustion', async () => {
    const result = await detectSup005BudgetExhausted(
      baseObservation(),
      buildContext({
        budget: {
          getExhaustedReason: () => 'tokens',
          getSpawnBudgetExceeded: () => false,
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-005');
    expect(result?.severity).toBe('S1');
    expect(result?.detail.exhaustedReason).toBe('tokens');
  });

  it('returns null when tracker reports no exhaustion', async () => {
    const result = await detectSup005BudgetExhausted(
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

  it('returns null when context.budget is null (no tracker registered)', async () => {
    const result = await detectSup005BudgetExhausted(
      baseObservation(),
      buildContext({ budget: null }),
    );
    expect(result).toBeNull();
  });
});
