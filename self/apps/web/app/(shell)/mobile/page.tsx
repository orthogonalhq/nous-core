'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { MobileOperationsSurface } from '@/components/mobile/mobile-operations-surface';
import { readMaoNavigationContext } from '@/lib/mao-links';
import { useProject } from '@/lib/project-context';
import { trpc } from '@/lib/trpc';

export default function MobilePage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6">
          <p className="text-muted-foreground">Loading mobile operating surface...</p>
        </div>
      }
    >
      <MobilePageContent />
    </React.Suspense>
  );
}

function MobilePageContent() {
  const { projectId, setProjectId } = useProject();
  const searchParams = useSearchParams();
  const linkedProjectId = searchParams.get('projectId');
  const linkedRunId = searchParams.get('runId');
  const linkedNodeId = searchParams.get('nodeId');
  const linkedPackageId = searchParams.get('packageId');
  const linkedReleaseId = searchParams.get('releaseId');
  const linkedCandidateId = searchParams.get('candidateId');
  const linkedSource = searchParams.get('source');
  const maoContext = readMaoNavigationContext(searchParams);

  React.useEffect(() => {
    if (linkedProjectId && linkedProjectId !== projectId) {
      setProjectId(linkedProjectId);
    }
  }, [linkedProjectId, projectId, setProjectId]);

  const operationsSnapshot = trpc.mobile.operationsSnapshot.useQuery(
    {
      projectId: projectId as any,
    },
    {
      enabled: projectId != null,
    },
  );

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          Select a project from the navigation to open the mobile operating surface.
        </p>
      </div>
    );
  }

  if (operationsSnapshot.isLoading || !operationsSnapshot.data) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Loading mobile operating surface...</p>
      </div>
    );
  }

  return (
    <MobileOperationsSurface
      snapshot={operationsSnapshot.data}
      maoContext={maoContext}
      linkedRunId={linkedRunId}
      linkedNodeId={linkedNodeId}
      marketplaceContext={
        linkedSource === 'marketplace' && (linkedPackageId || linkedCandidateId)
          ? {
              packageId: linkedPackageId,
              releaseId: linkedReleaseId,
              candidateId: linkedCandidateId,
            }
          : null
      }
    />
  );
}
