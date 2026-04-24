/**
 * UT-D8 — SUP-008 detector unit tests.
 */
import { describe, expect, it } from 'vitest';
import { detectSup008MissingLifecycle } from '../../detection/sup-008-missing-lifecycle.js';
import { baseObservation, buildContext } from './test-helpers.js';

describe('SUP-008 — missing lifecycle predecessor', () => {
  it('returns S1 candidate when from is not a valid predecessor (completed→running)', async () => {
    const result = await detectSup008MissingLifecycle(
      baseObservation({
        lifecycleTransition: { from: 'completed', to: 'running' },
      }),
      buildContext(),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-008');
    expect(result?.severity).toBe('S1');
  });

  it('returns null for valid pending→running transition', async () => {
    const result = await detectSup008MissingLifecycle(
      baseObservation({
        lifecycleTransition: { from: 'pending', to: 'running' },
      }),
      buildContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null for valid running→completed transition', async () => {
    const result = await detectSup008MissingLifecycle(
      baseObservation({
        lifecycleTransition: { from: 'running', to: 'completed' },
      }),
      buildContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null when lifecycleTransition is null (adjacent)', async () => {
    const result = await detectSup008MissingLifecycle(
      baseObservation({ lifecycleTransition: null }),
      buildContext(),
    );
    expect(result).toBeNull();
  });

  it('returns candidate when to-state is unknown to the graph', async () => {
    const result = await detectSup008MissingLifecycle(
      baseObservation({
        lifecycleTransition: { from: 'running', to: 'zombified' },
      }),
      buildContext(),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-008');
  });
});
