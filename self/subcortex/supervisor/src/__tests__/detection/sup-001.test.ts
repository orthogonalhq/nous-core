/**
 * UT-D1 — SUP-001 detector unit tests.
 *
 * Fixtures: positive (Worker + dispatch_agent), negative-benign (Worker +
 * benign tool), adjacent (Orchestrator + dispatch_agent).
 */
import { describe, expect, it } from 'vitest';
import { detectSup001Workers } from '../../detection/sup-001-worker-dispatch.js';
import { baseObservation, buildContext } from './test-helpers.js';

describe('SUP-001 — Worker dispatch_agent', () => {
  it('returns S0 candidate when Worker calls dispatch_agent', async () => {
    const result = await detectSup001Workers(
      baseObservation({
        agentClass: 'Worker',
        toolCall: { name: 'dispatch_agent', params: {} },
      }),
      buildContext(),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-001');
    expect(result?.severity).toBe('S0');
  });

  it('returns null when Worker calls a benign tool (read_file)', async () => {
    const result = await detectSup001Workers(
      baseObservation({
        agentClass: 'Worker',
        toolCall: { name: 'read_file', params: {} },
      }),
      buildContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null when Orchestrator calls dispatch_agent (adjacent)', async () => {
    const result = await detectSup001Workers(
      baseObservation({
        agentClass: 'Orchestrator',
        toolCall: { name: 'dispatch_agent', params: {} },
      }),
      buildContext(),
    );
    expect(result).toBeNull();
  });

  it('returns null when observation has no toolCall', async () => {
    const result = await detectSup001Workers(
      baseObservation({ agentClass: 'Worker', toolCall: null }),
      buildContext(),
    );
    expect(result).toBeNull();
  });
});
