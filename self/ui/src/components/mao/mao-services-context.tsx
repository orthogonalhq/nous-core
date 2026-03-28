'use client';

import * as React from 'react';

// ---------------------------------------------------------------------------
// Slimmed context — only framework-specific injections remain.
// Query/mutation hooks are now accessed via `trpc` from `@nous/transport`.
// ---------------------------------------------------------------------------

export interface MaoServicesContextValue {
  // Framework-agnostic injections that differ between Next.js and Desktop
  Link: React.ComponentType<{
    href: string;
    className?: string;
    children: React.ReactNode;
  }>;
  useProject: () => { projectId: string | null; setProjectId: (id: string) => void };
  useSearchParams: () => { get: (name: string) => string | null };
}

// ---------------------------------------------------------------------------
// Context + Provider + Hook
// ---------------------------------------------------------------------------

const MaoServicesContext = React.createContext<MaoServicesContextValue | null>(
  null,
);

export function MaoServicesProvider(props: {
  value: MaoServicesContextValue;
  children: React.ReactNode;
}) {
  return (
    <MaoServicesContext.Provider value={props.value}>
      {props.children}
    </MaoServicesContext.Provider>
  );
}

export function useMaoServices(): MaoServicesContextValue {
  const ctx = React.useContext(MaoServicesContext);
  if (!ctx) {
    throw new Error(
      'useMaoServices must be used within a <MaoServicesProvider>. ' +
        'Wrap the MAO component tree with MaoServicesProvider and supply all required service slots.',
    );
  }
  return ctx;
}
