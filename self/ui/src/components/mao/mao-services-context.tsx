'use client';

import * as React from 'react';
import type {
  ConfirmationProof,
  ConfirmationProofRequest,
  MaoAgentInspectProjection,
  MaoControlAuditHistory,
  MaoDensityMode,
  MaoProjectControlAction,
  MaoProjectControlResult,
  MaoProjectSnapshot,
  SystemStatusSnapshot,
} from '@nous/shared';

// ---------------------------------------------------------------------------
// Generic hook shape types — avoid importing tRPC in @nous/ui
// ---------------------------------------------------------------------------

/** Typed function signature for a tRPC-like query hook. */
export type QueryHook<TInput, TData> = (
  input: TInput,
  opts?: { enabled?: boolean },
) => { data: TData | undefined; isLoading: boolean; isError: boolean };

/** Typed function signature for a tRPC-like mutation hook. */
export type MutationHook<TInput, TData> = () => {
  mutate: (input: TInput) => void;
  data: TData | undefined;
  isPending: boolean;
  isError: boolean;
};

/** Typed function signature for a tRPC-like useUtils invalidation target. */
export type InvalidationTarget = { invalidate: () => Promise<void> };

// ---------------------------------------------------------------------------
// Context value interface
// ---------------------------------------------------------------------------

export interface MaoServicesContextValue {
  // Query hooks
  useSnapshotQuery: QueryHook<
    { projectId: string; densityMode: MaoDensityMode; workflowRunId?: string },
    MaoProjectSnapshot
  >;
  useInspectQuery: QueryHook<
    {
      projectId: string;
      agentId?: string;
      workflowRunId?: string;
      nodeDefinitionId?: string;
    },
    MaoAgentInspectProjection
  >;
  useAuditQuery: QueryHook<{ projectId: string }, MaoControlAuditHistory>;
  useSystemStatusQuery: QueryHook<void, SystemStatusSnapshot>;

  // Mutation hooks
  useControlMutation: MutationHook<
    {
      action: MaoProjectControlAction;
      reason: string;
      commandId: string;
    },
    MaoProjectControlResult
  >;
  useProofMutation: MutationHook<ConfirmationProofRequest, ConfirmationProof>;

  // Invalidation
  useInvalidation: () => {
    snapshotInvalidate: InvalidationTarget;
    inspectInvalidate: InvalidationTarget;
    controlProjectionInvalidate: InvalidationTarget;
    auditInvalidate: InvalidationTarget;
    systemStatusInvalidate: InvalidationTarget;
    dashboardInvalidate: InvalidationTarget;
    escalationsInvalidate: InvalidationTarget;
  };

  // Framework-agnostic injections
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
