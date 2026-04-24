// @vitest-environment jsdom

/**
 * Phase 1.3 INV-1 — Web ProjectContext consolidation structural regression.
 *
 * Asserts:
 *  - `@/lib/project-context` no longer exists (no module to import).
 *  - `useShellProjectShim` exists and, when mounted inside a `ShellProvider`
 *    with a given `activeProjectId`, returns `{ projectId, setProjectId }`
 *    shape where `projectId === activeProjectId`.
 *  - `setProjectId` delegates to `ShellContext.onProjectChange`.
 *
 * This is the structural end-to-end smoke for Goals C1 + INV-1.
 */
import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ShellProvider } from '@nous/ui/components';
import { useShellProjectShim } from '@/lib/use-shell-project-shim';

describe('Phase 1.3 — ShellContext consolidation (INV-1)', () => {
  afterEach(() => {
    cleanup();
  });

  it('project-context module is deleted on disk (INV-1)', async () => {
    // Static-file existence check — does not trigger Vite's import-analysis
    // (a dynamic string import of a missing path would fail at transform
    // time and break the test run).
    const fs = await import('node:fs');
    const path = await import('node:path');
    const p = path.resolve(__dirname, '..', 'lib', 'project-context.tsx');
    expect(fs.existsSync(p)).toBe(false);
  });

  it('useShellProjectShim returns projectId from ShellContext.activeProjectId', () => {
    const observed: Array<{ projectId: string | null }> = [];
    function Probe() {
      const { projectId } = useShellProjectShim();
      observed.push({ projectId });
      return null;
    }

    render(
      <ShellProvider activeProjectId="proj-xyz">
        <Probe />
      </ShellProvider>,
    );

    expect(observed[0]?.projectId).toBe('proj-xyz');
  });

  it('useShellProjectShim.setProjectId delegates to onProjectChange', () => {
    const onProjectChange = vi.fn();
    const setterRef: { current: ((id: string | null) => void) | null } = { current: null };
    function Probe() {
      const shim = useShellProjectShim();
      setterRef.current = shim.setProjectId;
      return null;
    }

    render(
      <ShellProvider
        activeProjectId="proj-initial"
        onProjectChange={onProjectChange}
      >
        <Probe />
      </ShellProvider>,
    );

    setterRef.current?.('proj-next');
    expect(onProjectChange).toHaveBeenCalledWith('proj-next');

    // null setter is a no-op (safe — ShellContext does not accept null).
    setterRef.current?.(null);
    expect(onProjectChange).toHaveBeenCalledTimes(1);
  });
});
