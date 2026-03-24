'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MarketplacePackageDetail } from '@/components/marketplace/marketplace-package-detail';
import { trpc } from '@/lib/trpc';

export default function MarketplacePackagePage() {
  return (
    <React.Suspense
      fallback={
        <div style={{ padding: 'var(--nous-space-4xl)' }}>
          <p style={{ color: 'var(--nous-text-secondary)' }}>Loading package detail...</p>
        </div>
      }
    >
      <MarketplacePackagePageContent />
    </React.Suspense>
  );
}

function MarketplacePackagePageContent() {
  const params = useParams<{ packageId: string }>();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId') ?? undefined;
  const detailQuery = trpc.marketplace.getPackageDetail.useQuery({
    packageId: params.packageId,
    projectId: projectId as any,
  });

  if (detailQuery.isLoading || !detailQuery.data) {
    return (
      <div style={{ padding: 'var(--nous-space-4xl)' }}>
        <p style={{ color: 'var(--nous-text-secondary)' }}>Loading package detail...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--nous-space-4xl)' }}>
      <MarketplacePackageDetail
        snapshot={detailQuery.data}
        projectId={projectId}
      />
    </div>
  );
}
