'use client';

import * as React from 'react';
import Link from 'next/link';
import type { MobileOperationsSnapshot } from '@nous/shared';
import type { MaoNavigationContext } from '@/lib/mao-links';
import { buildMaoReturnHref } from '@/lib/mao-links';
import { trpc } from '@/lib/trpc';
import { MobileEscalationList } from './mobile-escalation-list';
import { MobileFollowUpCard } from './mobile-follow-up-card';
import { MobileProjectSummary } from './mobile-project-summary';

interface MobileOperationsSurfaceProps {
  snapshot: MobileOperationsSnapshot;
  maoContext?: MaoNavigationContext | null;
  linkedRunId?: string | null;
  linkedNodeId?: string | null;
  marketplaceContext?: {
    packageId: string | null;
    releaseId: string | null;
    candidateId: string | null;
  } | null;
}

function buildQueryString(input: {
  projectId: string;
  runId?: string | null;
  nodeId?: string | null;
  packageId?: string | null;
  releaseId?: string | null;
  candidateId?: string | null;
  evidenceRef?: string | null;
  reasoningRef?: string | null;
  source?: string | null;
}) {
  const params = new URLSearchParams();
  params.set('projectId', input.projectId);
  if (input.runId) {
    params.set('runId', input.runId);
  }
  if (input.nodeId) {
    params.set('nodeId', input.nodeId);
  }
  if (input.packageId) {
    params.set('packageId', input.packageId);
  }
  if (input.releaseId) {
    params.set('releaseId', input.releaseId);
  }
  if (input.candidateId) {
    params.set('candidateId', input.candidateId);
  }
  if (input.evidenceRef) {
    params.set('evidenceRef', input.evidenceRef);
  }
  if (input.reasoningRef) {
    params.set('reasoningRef', input.reasoningRef);
  }
  if (input.source) {
    params.set('source', input.source);
  }
  return params.toString();
}

export function MobileOperationsSurface({
  snapshot,
  maoContext,
  linkedRunId,
  linkedNodeId,
  marketplaceContext,
}: MobileOperationsSurfaceProps) {
  const utils = trpc.useUtils();
  const acknowledge = trpc.escalations.acknowledge.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.mobile.operationsSnapshot.invalidate({ projectId: updated.projectId }),
        utils.escalations.listProjectQueue.invalidate({ projectId: updated.projectId }),
        utils.projects.dashboardSnapshot.invalidate({ projectId: updated.projectId }),
      ]);
    },
  });

  const continuityQuery = buildQueryString({
    projectId: snapshot.project.id,
    runId: linkedRunId,
    nodeId: linkedNodeId,
    packageId: marketplaceContext?.packageId ?? null,
    releaseId: marketplaceContext?.releaseId ?? null,
    candidateId: marketplaceContext?.candidateId ?? null,
    evidenceRef: maoContext?.evidenceRef ?? null,
    reasoningRef: maoContext?.reasoningRef ?? null,
    source: maoContext ? 'mao' : marketplaceContext ? 'marketplace' : null,
  });

  const quickLinks = [
    { label: 'Open Projects', href: `/projects?${continuityQuery}` },
    { label: 'Open Chat', href: `/chat?${continuityQuery}` },
    { label: 'Open MAO', href: `/mao?${continuityQuery}` },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Mobile Operations Surface</h1>
        <p className="text-sm text-muted-foreground">
          Review canonical project status, handle escalations, and continue follow-up
          work from a compact projection-only mobile surface.
        </p>
      </div>

      {maoContext ? (
        <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          MAO handoff active
          {linkedRunId ? ` for run ${linkedRunId.slice(0, 8)}` : ''}
          {linkedNodeId ? ` and node ${linkedNodeId.slice(0, 8)}` : ''}
          {maoContext.evidenceRef ? ` with evidence ${maoContext.evidenceRef}` : ''}.
          <Link
            href={buildMaoReturnHref(maoContext)}
            className="ml-2 underline underline-offset-4"
          >
            Return to MAO
          </Link>
        </div>
      ) : null}

      {marketplaceContext ? (
        <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Marketplace handoff active
          {marketplaceContext.packageId ? ` for package ${marketplaceContext.packageId}` : ''}
          {marketplaceContext.releaseId ? ` release ${marketplaceContext.releaseId}` : ''}
          {marketplaceContext.candidateId ? ` candidate ${marketplaceContext.candidateId}` : ''}.
        </div>
      ) : null}

      {linkedRunId || linkedNodeId ? (
        <div className="rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
          Linked workflow context
          {linkedRunId ? ` run ${linkedRunId.slice(0, 8)}` : ''}
          {linkedNodeId ? ` node ${linkedNodeId.slice(0, 8)}` : ''}.
        </div>
      ) : null}

      <MobileProjectSummary snapshot={snapshot} quickLinks={quickLinks} />
      <MobileEscalationList
        snapshot={snapshot}
        pending={acknowledge.isPending}
        onAcknowledge={(escalationId) =>
          acknowledge.mutate({
            escalationId,
            surface: 'mobile',
            actorType: 'principal',
            note: 'Acknowledged from Mobile',
          })
        }
      />
      <MobileFollowUpCard snapshot={snapshot} />
    </div>
  );
}
