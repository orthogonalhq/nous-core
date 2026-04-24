/**
 * UT-D3 — SUP-003 detector unit tests.
 */
import { describe, expect, it } from 'vitest';
import { detectSup003ScopeBoundary } from '../../detection/sup-003-scope-boundary.js';
import type { ToolSurfaceReadonlyView } from '../../detection/types.js';
import { baseObservation, buildContext } from './test-helpers.js';

function workerSurface(): ToolSurfaceReadonlyView {
  const allowed = ['read_file', 'run_bash'] as const;
  const set = new Set<string>(allowed);
  return {
    agentClass: 'Worker',
    allowedToolNames: allowed,
    isAllowed: (name) => set.has(name),
  };
}

function wildcardSurface(): ToolSurfaceReadonlyView {
  return {
    agentClass: 'Cortex::Principal',
    allowedToolNames: ['*'],
    isAllowed: () => true,
  };
}

describe('SUP-003 — scope-boundary tool use', () => {
  it('returns S1 candidate when Worker calls tool not on surface', async () => {
    const result = await detectSup003ScopeBoundary(
      baseObservation({
        agentClass: 'Worker',
        toolCall: { name: 'send_email', params: {} },
      }),
      buildContext({ toolSurface: workerSurface() }),
    );
    expect(result).not.toBeNull();
    expect(result?.supCode).toBe('SUP-003');
    expect(result?.severity).toBe('S1');
  });

  it('returns null when tool is in the allow list', async () => {
    const result = await detectSup003ScopeBoundary(
      baseObservation({
        agentClass: 'Worker',
        toolCall: { name: 'read_file', params: {} },
      }),
      buildContext({ toolSurface: workerSurface() }),
    );
    expect(result).toBeNull();
  });

  it('returns null when surface carries wildcard (cortex tier bypass)', async () => {
    const result = await detectSup003ScopeBoundary(
      baseObservation({
        agentClass: 'Cortex::Principal',
        toolCall: { name: 'anything', params: {} },
      }),
      buildContext({ toolSurface: wildcardSurface() }),
    );
    expect(result).toBeNull();
  });

  it('returns null when toolSurface is absent (no scope registered)', async () => {
    const result = await detectSup003ScopeBoundary(
      baseObservation({
        agentClass: 'Worker',
        toolCall: { name: 'send_email', params: {} },
      }),
      buildContext({ toolSurface: null }),
    );
    expect(result).toBeNull();
  });

  it('returns null when observation has no toolCall', async () => {
    const result = await detectSup003ScopeBoundary(
      baseObservation({ toolCall: null }),
      buildContext({ toolSurface: workerSurface() }),
    );
    expect(result).toBeNull();
  });
});
