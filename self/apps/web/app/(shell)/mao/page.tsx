'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  MaoOperatingSurface,
  MaoServicesProvider,
} from '@nous/ui/components';
import type { MaoServicesContextValue } from '@nous/ui/components';
import { trpc } from '@/lib/trpc';
import { useProject } from '@/lib/project-context';

function useMaoServicesValue(): MaoServicesContextValue {
  const utils = trpc.useUtils();

  return {
    useSnapshotQuery: (input, opts) =>
      trpc.mao.getProjectSnapshot.useQuery(input, opts),
    useInspectQuery: (input, opts) =>
      trpc.mao.getAgentInspectProjection.useQuery(input, opts),
    useAuditQuery: (input, opts) =>
      trpc.mao.getControlAuditHistory.useQuery(input, opts),
    useSystemStatusQuery: (_input, opts) =>
      trpc.health.systemStatus.useQuery(undefined, opts),
    useControlMutation: (opts) => {
      const mutation = trpc.mao.requestProjectControl.useMutation({
        onSuccess: (data) => opts?.onSuccess?.(data),
      });
      return {
        mutate: mutation.mutate,
        data: mutation.data,
        isPending: mutation.isPending,
        isError: mutation.isError,
      };
    },
    useProofMutation: (opts) => {
      const mutation = trpc.opctl.requestConfirmationProof.useMutation({
        onSuccess: (data) => opts?.onSuccess?.(data),
      });
      return {
        mutate: mutation.mutate,
        data: mutation.data,
        isPending: mutation.isPending,
        isError: mutation.isError,
      };
    },
    useInvalidation: () => ({
      snapshotInvalidate: { invalidate: () => utils.mao.getProjectSnapshot.invalidate() },
      inspectInvalidate: { invalidate: () => utils.mao.getAgentInspectProjection.invalidate() },
      controlProjectionInvalidate: { invalidate: () => utils.mao.getProjectControlProjection.invalidate() },
      auditInvalidate: { invalidate: () => utils.mao.getControlAuditHistory.invalidate() },
      systemStatusInvalidate: { invalidate: () => utils.health.systemStatus.invalidate() },
      dashboardInvalidate: { invalidate: () => utils.projects.dashboardSnapshot.invalidate() },
      escalationsInvalidate: { invalidate: () => utils.escalations.listProjectQueue.invalidate() },
    }),
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
