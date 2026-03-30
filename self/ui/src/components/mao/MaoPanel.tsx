'use client';

import * as React from 'react';
import { trpc } from '@nous/transport';
import { useShellContext } from '../shell/ShellContext';
import { MaoOperatingSurface } from './mao-operating-surface';
import { MaoServicesProvider } from './mao-services-context';
import type { MaoServicesContextValue } from './mao-services-context';

/** Inert link — MAO deep links are rendered as plain text in panel context. */
function InertLink(props: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <span className={props.className} style={{ cursor: 'default' }}>
      {props.children}
    </span>
  );
}

/** Stub search params — panels don't use URL routing. */
function useStubSearchParams() {
  return { get: (_name: string) => null };
}

/**
 * App-agnostic MAO panel. Reads project context from ShellContext,
 * auto-selects first project when none is active, and wraps
 * MaoOperatingSurface with default MaoServicesProvider bindings.
 *
 * Used by both desktop (dockview panel) and web (route/panel mount).
 */
export function MaoPanel() {
  const { activeProjectId } = useShellContext();
  const [localProjectId, setLocalProjectId] = React.useState<string | null>(null);

  // Auto-select first project when neither shell nor local state has one
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    enabled: activeProjectId == null && localProjectId == null,
  });

  React.useEffect(() => {
    if (activeProjectId == null && localProjectId == null && projectsQuery.data?.length) {
      setLocalProjectId(projectsQuery.data[0].id);
    }
  }, [activeProjectId, localProjectId, projectsQuery.data]);

  const effectiveProjectId = activeProjectId ?? localProjectId;

  const useProject = React.useCallback(
    () => ({
      projectId: effectiveProjectId,
      setProjectId: setLocalProjectId,
    }),
    [effectiveProjectId],
  );

  const services = React.useMemo<MaoServicesContextValue>(
    () => ({
      Link: InertLink,
      useProject,
      useSearchParams: useStubSearchParams,
    }),
    [useProject],
  );

  return (
    <React.Suspense
      fallback={
        <div style={{ padding: 'var(--nous-space-4xl)', height: '100%' }}>
          <p style={{ color: 'var(--nous-text-secondary)' }}>Loading MAO projection...</p>
        </div>
      }
    >
      <MaoServicesProvider value={services}>
        <div style={{ height: '100%' }}>
          <MaoOperatingSurface />
        </div>
      </MaoServicesProvider>
    </React.Suspense>
  );
}
