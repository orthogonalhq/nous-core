// @vitest-environment jsdom

/**
 * Phase 1.3 INV-12 — MaoServicesContextValue contract preservation.
 *
 * Under SDS Option B (web-side shim), the `@nous/ui`
 * `MaoServicesContextValue.useProject` contract is preserved verbatim. This
 * test:
 *  1. Asserts the runtime-observable signature of the slot (type-level
 *     `satisfies` check plus runtime smoke call).
 *  2. Mounts a `ShellProvider` in a test harness and confirms that
 *     `useShellProjectShim` resolves `projectId` through
 *     `ShellContext.activeProjectId` — i.e., the shim actually closes the
 *     migration loop.
 *
 * Failure of this test indicates either the `@nous/ui` contract drifted
 * (row 14) or the shim has been bypassed (row 13) — see SDS Failure Modes.
 */
import * as React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MaoServicesContextValue } from '@nous/ui/components';
import { ShellProvider } from '@nous/ui/components';
import { useShellProjectShim } from '@/lib/use-shell-project-shim';

describe('Phase 1.3 — MaoServicesContextValue contract (INV-12)', () => {
  afterEach(() => {
    cleanup();
  });

  it('useShellProjectShim satisfies the MaoServicesContextValue.useProject slot shape', () => {
    // Type-level satisfies — compile-time guard: if the contract shape in
    // @nous/ui changes, this assignment stops compiling. That is the signal
    // Failure Mode row 14 catches.
    const _slot: MaoServicesContextValue['useProject'] = useShellProjectShim;
    expect(typeof _slot).toBe('function');
  });

  it('the shim, mounted inside ShellProvider, returns { projectId, setProjectId } with projectId matching activeProjectId', () => {
    const observed: Array<{ projectId: string | null; setProjectId: unknown }> = [];

    function Probe() {
      // Invoke through the MaoServicesContextValue slot signature — this
      // mimics how MAO panels consume the hook through the provider.
      const services: MaoServicesContextValue = {
        Link: () => null,
        useProject: useShellProjectShim,
        useSearchParams: () => ({ get: () => null }),
      };
      const { projectId, setProjectId } = services.useProject();
      observed.push({ projectId, setProjectId });
      return null;
    }

    render(
      <ShellProvider activeProjectId="contract-test-project">
        <Probe />
      </ShellProvider>,
    );

    expect(observed[0]?.projectId).toBe('contract-test-project');
    expect(typeof observed[0]?.setProjectId).toBe('function');
  });

  it('shim setProjectId routes through ShellContext.onProjectChange', () => {
    const onProjectChange = vi.fn();

    const capturedSetRef: { current: ((id: string | null) => void) | null } = { current: null };
    function Probe() {
      const services: MaoServicesContextValue = {
        Link: () => null,
        useProject: useShellProjectShim,
        useSearchParams: () => ({ get: () => null }),
      };
      const { setProjectId } = services.useProject();
      capturedSetRef.current = setProjectId;
      return null;
    }

    render(
      <ShellProvider activeProjectId="init" onProjectChange={onProjectChange}>
        <Probe />
      </ShellProvider>,
    );

    capturedSetRef.current?.('next');
    expect(onProjectChange).toHaveBeenCalledWith('next');
  });
});
