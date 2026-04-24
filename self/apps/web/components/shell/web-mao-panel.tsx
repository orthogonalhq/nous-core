'use client';

import * as React from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  MaoOperatingSurface,
  MaoServicesProvider,
} from '@nous/ui/components';
import type { MaoServicesContextValue } from '@nous/ui/components';
import { useShellProjectShim } from '@/lib/use-shell-project-shim';

function useWebMaoServices(): MaoServicesContextValue {
  return {
    Link,
    useProject: useShellProjectShim,
    useSearchParams,
  };
}

export function WebMaoPanel(_props: IDockviewPanelProps) {
  const services = useWebMaoServices();

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
