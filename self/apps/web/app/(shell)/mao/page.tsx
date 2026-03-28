'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  MaoOperatingSurface,
  MaoServicesProvider,
} from '@nous/ui/components';
import type { MaoServicesContextValue } from '@nous/ui/components';
import { useProject } from '@/lib/project-context';

function useMaoServicesValue(): MaoServicesContextValue {
  return {
    Link,
    useProject,
    useSearchParams,
  };
}

export default function MaoPage() {
  const services = useMaoServicesValue();

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
