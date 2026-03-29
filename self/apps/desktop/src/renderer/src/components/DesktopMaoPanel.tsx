'use client';

import * as React from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import {
  MaoOperatingSurface,
  MaoServicesProvider,
} from '@nous/ui/components';
import type { MaoServicesContextValue } from '@nous/ui/components';

/**
 * Desktop-specific project state for MAO.
 * Uses a simple local state since the desktop app doesn't have a global
 * project context yet. The project list tRPC query provides available IDs.
 */
function useDesktopProject() {
  const [projectId, setProjectId] = React.useState<string | null>(null);
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
