'use client';

import * as React from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { MarketplacePackageDetail } from '@/components/marketplace/marketplace-package-detail';
import { trpc } from '@/lib/trpc';

export default function MarketplacePackagePage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-8">
          <p className="text-muted-foreground">Loading package detail...</p>
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
      <div className="p-8">
        <p className="text-muted-foreground">Loading package detail...</p>
      </div>
    );
  }

  return (
    <div className="p-8">
      <MarketplacePackageDetail snapshot={detailQuery.data} />
    </div>
  );
}
