'use client';

import * as React from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import {
  MaoOperatingSurface,
  MaoServicesProvider,
} from '@nous/ui/components';
import type { MaoServicesContextValue } from '@nous/ui/components';
import { trpc } from '@nous/transport';

/**
 * Desktop-specific project state for MAO.
 *
 * Stopgap: auto-selects the first available project so the MAO surface
 * renders with live data. The MAO surface is specced to be system-wide
 * (all agents across all projects), but the current projection service
 * and tRPC queries are project-scoped. System-wide MAO is tracked
 * separately — this auto-select ensures WR-088 inference data is visible.
 */
function useDesktopProject() {
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const { data: projects } = trpc.projects.list.useQuery();

  React.useEffect(() => {
    if (projectId == null && projects && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projectId, projects]);

  return { projectId, setProjectId };
}

/**
 * Desktop-compatible search params hook.
 * The desktop app uses dockview panels, not URL routing,
 * so search params are not applicable — return a no-op stub.
 */
function useDesktopSearchParams() {
  return { get: (_name: string) => null };
}

/**
 * Desktop Link component — renders a plain anchor tag.
 * In the desktop app, MAO deep links are not navigable via URL routing.
 */
function DesktopLink(props: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <span className={props.className} style={{ cursor: 'default' }}>
      {props.children}
    </span>
  );
}

function useDesktopMaoServices(): MaoServicesContextValue {
  return {
    Link: DesktopLink,
    useProject: useDesktopProject,
    useSearchParams: useDesktopSearchParams,
  };
}

export function DesktopMaoPanel(_props: IDockviewPanelProps) {
  const services = useDesktopMaoServices();

  return (
    <React.Suspense
      fallback={
        <div style={{ padding: 'var(--nous-space-4xl)' }}>
          <p style={{ color: 'var(--nous-text-secondary)' }}>Loading MAO projection...</p>
        </div>
      }
    >
      <MaoServicesProvider value={services}>
        <MaoOperatingSurface />
      </MaoServicesProvider>
    </React.Suspense>
  );
}
