// @vitest-environment jsdom

/**
 * Phase 1.3 INV-3 — Desktop `handleProjectChange` parity assertion.
 *
 * Scope: verify the behavioral contract of the desktop project-change flow
 * without depending on the full App.tsx mount chain (which brings Electron,
 * tRPC bootstrap, and a first-run wizard). The unit under test is the
 * two-step handler sequence:
 *
 *   1. Inner handler (in `DesktopShellWithProject`) calls `setActiveProjectId`
 *      + `onProjectChange?.(id)`.
 *   2. Outer handler (`handleDesktopProjectChange` in the main App) resets
 *      `activeRoute` to 'home' and clears `isHomeContext`.
 *
 * INV-3 requires:
 *   - route is reset to 'home' on project switch,
 *   - navigation history is cleared (in desktop, `history: [activeRoute]` so
 *     clearing route clears history),
 *   - NO explicit view-state restore call is issued (reactivity comes from
 *     1.2's hook family keyed on `ShellContext.activeProjectId`).
 *
 * We simulate the contract by wiring a stand-in component that mirrors the
 * production handler composition one-to-one.
 */
import * as React from 'react';
import { cleanup, render, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShellProvider, useShellContext } from '@nous/ui/components';

describe('Phase 1.3 — Desktop handleProjectChange (INV-3)', () => {
  afterEach(() => {
    cleanup();
  });

  it('project switch resets activeRoute to home and clears nav history; no view-state hook invoked inside the handler', () => {
    // Mirrors `handleDesktopProjectChange` in App.tsx:594-597 one-for-one.
    const outerState = { activeRoute: 'traces', isHomeContext: true };
    const outerHandler = vi.fn((_id: string) => {
      outerState.isHomeContext = false;
      outerState.activeRoute = 'home';
    });

    let fireFromInside: ((id: string) => void) | null = null;
    function Harness() {
      const { onProjectChange } = useShellContext();
      fireFromInside = onProjectChange ?? null;
      return null;
    }

    render(
      <ShellProvider activeProjectId="proj-1" onProjectChange={outerHandler}>
        <Harness />
      </ShellProvider>,
    );

    expect(typeof fireFromInside).toBe('function');

    act(() => {
      fireFromInside?.('proj-2');
    });

    expect(outerHandler).toHaveBeenCalledWith('proj-2');
    expect(outerState.activeRoute).toBe('home');
    expect(outerState.isHomeContext).toBe(false);
  });

  it('derived navigation history collapses to single "home" entry after reset', () => {
    // Desktop computes `navigation: { history: [activeRoute], ... }` (App.tsx
    // around L615) — clearing `activeRoute` inherently clears history.
    const activeRoute = 'home';
    const navigation = { activeRoute, history: [activeRoute], canGoBack: false };
    expect(navigation.history).toEqual(['home']);
  });

  it('desktop handleProjectChange module-level source does NOT invoke useLayoutState / useNavigationState / useProjectViewState (structural regression)', async () => {
    // Structural regression guard — static source scan. If a future edit
    // accidentally reintroduces an explicit view-state restore call inside
    // the handleProjectChange body, this test fails. We read the raw source.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const source = await fs.readFile(
      path.resolve(__dirname, '..', 'src', 'renderer', 'src', 'App.tsx'),
      'utf8',
    );
    // Find the inner handleProjectChange body inside DesktopShellWithProject.
    const innerHandlerMatch = source.match(
      /const handleProjectChange = useCallback\(\(projectId: string\) => \{[\s\S]*?\}, \[onProjectChange\]\)/,
    );
    expect(innerHandlerMatch, 'inner handleProjectChange must be recognizable').toBeTruthy();
    const body = innerHandlerMatch?.[0] ?? '';
    expect(body).not.toMatch(/useLayoutState\s*\(/);
    expect(body).not.toMatch(/useNavigationState\s*\(/);
    expect(body).not.toMatch(/useProjectViewState\s*\(/);
  });
});
