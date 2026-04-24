'use client';

import { useShellContextOptional } from '@nous/ui/components';

/**
 * Adapter for MaoServicesContextValue.useProject that reads project identity
 * from ShellContext instead of the deleted ProjectContext.
 *
 * Preserves the `{ projectId, setProjectId }` contract shape expected by
 * `MaoServicesContextValue` so that `@nous/ui`'s MAO surface remains
 * unchanged (SDS Option B — web-side shim).
 *
 * `setProjectId` delegates to `ShellContext.onProjectChange`; if
 * `onProjectChange` is undefined (edge case: MAO rendered outside a
 * configured `ShellProvider`), the setter is a no-op. This is safe
 * because MAO surfaces are always mounted inside `<ShellProvider>` in
 * web (verified: `(shell)/layout.tsx` wraps children with ShellProvider).
 *
 * Note: `ShellContext.onProjectChange` does not accept `null` (it expects a
 * string projectId). The shim guards null by performing a no-op, which
 * matches the verified MAO caller surface — web MAO consumers do not
 * invoke `setProjectId(null)` today. If a future caller needs a dedicated
 * clear action, extend the shim (or route through a new clear action).
 */
export function useShellProjectShim(): {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
} {
  // Use the optional variant so the shim is safe during Next.js SSR /
  // static-prerender, where the MAO surface may be analysed outside a
  // mounted `<ShellProvider>`. In normal runtime flow (MAO rendered inside
  // the shell layout), this resolves to the active provider value.
  const shell = useShellContextOptional();
  const activeProjectId = shell?.activeProjectId ?? null;
  const onProjectChange = shell?.onProjectChange;
  return {
    projectId: activeProjectId,
    setProjectId: (id) => {
      if (id === null) return;
      onProjectChange?.(id);
    },
  };
}
