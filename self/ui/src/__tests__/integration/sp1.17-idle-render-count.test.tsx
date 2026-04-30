// @vitest-environment jsdom

/**
 * Phase 1.17 SUPV-SP1.17-024 — Tier 2 idle steady-state render-count
 * integration test.
 *
 * Mounts the trio-consumer subtree in a configuration that mirrors the BT R3
 * post-mount idle steady state. Verifies that each named consumer (memoized
 * via React.memo) renders at most once after the initial first-paint
 * hydration commit, when the parent <ShellProvider> is re-rendered with the
 * SAME props (the in-test analog of a no-op refetch tick).
 *
 * This is the unit-level analog of Goals SC-1 (idle BT thresholds) and the
 * regression net for the architectural fix that identity-stability unit tests
 * on individual sites alone would not catch.
 */

import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShellProvider } from '../../components/shell/ShellContext';
import { useShellContext } from '../../components/shell/ShellContext';

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface RenderCounter {
  count: number;
}

function makeMemoConsumer(label: string, counter: RenderCounter) {
  const Inner = React.memo(function MemoConsumer() {
    counter.count += 1;
    const ctx = useShellContext();
    return (
      <div data-testid={`consumer-${label}`}>
        {label}|{ctx.breakpoint}|{ctx.activeRoute}
      </div>
    );
  });
  Inner.displayName = `MemoConsumer(${label})`;
  return Inner;
}

describe('Phase 1.17 SUPV-SP1.17-024 — idle steady-state render-count regression', () => {
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

  it('Phase 1.17 SUPV-SP1.17-024: trio-consumer subtree renders ≤ 1 time per simulated 5 s idle window (no-op parent re-renders preserve identity)', async () => {
    // Four memoized consumers stand in for StatusBar / MaoBacklogPressureCard
    // / SystemStatusWidget / MaoOperatingSurface (all React.memo would be
    // skipped by context broadcast, but stable context value identity means
    // their `useShellContext()` return reads the same object → in practice
    // their downstream `useMemo`/`useEffect` deps are stable).
    const counters = {
      statusBar: { count: 0 },
      backlog: { count: 0 },
      systemStatus: { count: 0 },
      maoSurface: { count: 0 },
    };

    const StatusBarStub = makeMemoConsumer('statusBar', counters.statusBar);
    const BacklogStub = makeMemoConsumer('backlog', counters.backlog);
    const SystemStatusStub = makeMemoConsumer('systemStatus', counters.systemStatus);
    const MaoSurfaceStub = makeMemoConsumer('maoSurface', counters.maoSurface);

    function Subtree() {
      return (
        <>
          <StatusBarStub />
          <BacklogStub />
          <SystemStatusStub />
          <MaoSurfaceStub />
        </>
      );
    }

    await act(async () => {
      root.render(
        <ShellProvider mode="developer" breakpoint="full" activeRoute="dashboard">
          <Subtree />
        </ShellProvider>,
      );
    });

    // First-paint counts (each consumer mounts once).
    const firstCounts = {
      statusBar: counters.statusBar.count,
      backlog: counters.backlog.count,
      systemStatus: counters.systemStatus.count,
      maoSurface: counters.maoSurface.count,
    };
    expect(firstCounts.statusBar).toBe(1);
    expect(firstCounts.backlog).toBe(1);
    expect(firstCounts.systemStatus).toBe(1);
    expect(firstCounts.maoSurface).toBe(1);

    // Simulate 5 no-op parent re-renders with the SAME props (the in-test
    // analog of a 5 s idle window with five no-op refetch ticks). With the
    // SP 1.17 RC-B3 ShellContext value useMemo in place, the context value
    // identity is stable, so React.memo'd consumers MUST NOT re-render.
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        root.render(
          <ShellProvider mode="developer" breakpoint="full" activeRoute="dashboard">
            <Subtree />
          </ShellProvider>,
        );
      });
    }

    // Each consumer renders at most once after the initial first-paint
    // hydration commit (i.e., total ≤ 2). With React.memo + stable context
    // value, expected total is exactly 1 per consumer (the initial mount).
    expect(counters.statusBar.count).toBeLessThanOrEqual(2);
    expect(counters.backlog.count).toBeLessThanOrEqual(2);
    expect(counters.systemStatus.count).toBeLessThanOrEqual(2);
    expect(counters.maoSurface.count).toBeLessThanOrEqual(2);

    // Strict assertion: with the RC-B3 useMemo in place, no consumer should
    // have re-rendered after first paint at all.
    expect(counters.statusBar.count).toBe(1);
    expect(counters.backlog.count).toBe(1);
    expect(counters.systemStatus.count).toBe(1);
    expect(counters.maoSurface.count).toBe(1);
  });
});
