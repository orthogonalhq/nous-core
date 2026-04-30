// @vitest-environment jsdom
//
// Phase 1.17 SUPV-SP1.17-006 — RC-B4 contract identity-stability test for
// `useTabState` return value. Validates that the returned object reference
// is stable across no-input-change re-renders, and that it changes when
// observed state values change.

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useTabState, type InspectTarget } from '../use-tab-state';

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Capture {
  refs: ReturnType<typeof useTabState>[];
  setSelectedTarget: ((t: InspectTarget | null) => void) | null;
}

function HarnessTabState({ capture, unrelated }: { capture: Capture; unrelated: number }) {
  // `unrelated` triggers re-renders without changing useTabState's observed
  // state, exercising the no-input-change identity-stability invariant.
  void unrelated;
  const tab = useTabState('D2');
  capture.refs.push(tab);
  capture.setSelectedTarget = tab.setSelectedTarget;
  return <div data-testid="harness">{tab.densityMode}</div>;
}

describe('useTabState — Phase 1.17 SUPV-SP1.17-006 contract identity stability', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('Phase 1.17 SUPV-SP1.17-006: useTabState return identity is stable when state values are content-stable', async () => {
    const capture: Capture = { refs: [], setSelectedTarget: null };

    await act(async () => {
      root.render(<HarnessTabState capture={capture} unrelated={0} />);
    });
    expect(capture.refs).toHaveLength(1);

    // Trigger an unrelated parent re-render (no setter calls inside useTabState).
    await act(async () => {
      root.render(<HarnessTabState capture={capture} unrelated={1} />);
    });

    expect(capture.refs.length).toBeGreaterThanOrEqual(2);
    // Identity-stability invariant: same return object reference across no-op
    // re-renders.
    expect(capture.refs[capture.refs.length - 1]).toBe(capture.refs[0]);
  });

  it('Phase 1.17 SUPV-SP1.17-006: useTabState return identity changes when state values change', async () => {
    const capture: Capture = { refs: [], setSelectedTarget: null };

    await act(async () => {
      root.render(<HarnessTabState capture={capture} unrelated={0} />);
    });
    const firstRef = capture.refs[0];
    expect(firstRef.selectedTarget).toBeNull();

    // Trigger an actual state change through the hook's setter.
    await act(async () => {
      capture.setSelectedTarget?.({
        agentId: 'a1',
        nodeDefinitionId: null,
        workflowRunId: null,
      });
    });

    const latestRef = capture.refs[capture.refs.length - 1];
    expect(latestRef).not.toBe(firstRef);
    expect(latestRef.selectedTarget).toEqual({
      agentId: 'a1',
      nodeDefinitionId: null,
      workflowRunId: null,
    });
  });
});
