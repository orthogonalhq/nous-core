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
        <div style={{ padding: 'var(--nous-space-3xl)' }}>
          <p style={{ color: 'var(--nous-text-secondary)' }}>Loading mobile operating surface...</p>
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
      <div
        style={{
          display: 'flex',
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--nous-space-4xl)',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            maxWidth: '24rem',
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          Select a project from the navigation to open the mobile operating surface.
        </p>
      </div>
    );
  }

  if (operationsSnapshot.isLoading || !operationsSnapshot.data) {
    return (
      <div style={{ padding: 'var(--nous-space-3xl)' }}>
        <p style={{ color: 'var(--nous-text-secondary)' }}>Loading mobile operating surface...</p>
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
