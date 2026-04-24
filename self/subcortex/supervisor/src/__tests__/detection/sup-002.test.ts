/**
 * UT-D2 — SUP-002 detector unit tests.
 *
 * Fixtures: positive (Worker + Principal routing), negative (no routing
 * target), adjacent (Orchestrator routing to Principal).
 */
import { describe, expect, it } from 'vitest';
import { detectSup002WorkerPrincipalRouting } from '../../detection/sup-002-worker-principal-routing.js';
import { baseObservation, buildContext } from './test-helpers.js';

describe('SUP-002 — Worker→Principal routing', () => {
  it('returns S0 candidate when Worker routes to Cortex::Principal', async () => {
    const result = await detectSup002WorkerPrincipalRouting(
      baseObservation({
        agentClass: 'Worker',
        routingTarget: { kind: 'Cortex::Principal' },
      }),
      buildContext(),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-002');
    expect(result?.severity).toBe('S0');
  });

  it('returns S0 candidate when Worker routes to Principal', async () => {
    const result = await detectSup002WorkerPrincipalRouting(
      baseObservation({
        agentClass: 'Worker',
        routingTarget: { kind: 'Principal' },
      }),
      buildContext(),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-002');
  });

  it('returns null when routingTarget is null (contract-grounded no-fire)', async () => {
    const result = await detectSup002WorkerPrincipalRouting(
      baseObservation({ agentClass: 'Worker', routingTarget: null }),
      buildContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null when Orchestrator routes to Principal (adjacent)', async () => {
    const result = await detectSup002WorkerPrincipalRouting(
      baseObservation({
        agentClass: 'Orchestrator',
        routingTarget: { kind: 'Cortex::Principal' },
      }),
      buildContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null when Worker routes to Orchestrator (benign)', async () => {
    const result = await detectSup002WorkerPrincipalRouting(
      baseObservation({
        agentClass: 'Worker',
        routingTarget: { kind: 'Orchestrator' },
      }),
      buildContext(),
    );
    expect(result).toBeNull();
  });
});
