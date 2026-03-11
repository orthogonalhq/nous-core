'use client';

import * as React from 'react';
import Link from 'next/link';
import type { RegistryBrowseResult } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface MarketplaceBrowserProps {
  query: string;
  onQueryChange: (next: string) => void;
  snapshot: RegistryBrowseResult | undefined;
  isLoading: boolean;
  projectId: string | null;
}

export function MarketplaceBrowser({
  query,
  onQueryChange,
  snapshot,
  isLoading,
  projectId,
}: MarketplaceBrowserProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
          <span>Marketplace browser</span>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {snapshot?.totalCount ?? 0} package
              {(snapshot?.totalCount ?? 0) === 1 ? '' : 's'}
            </Badge>
            {projectId ? <Badge variant="outline">project scoped</Badge> : null}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search registry packages"
          aria-label="Search registry packages"
        />

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading registry packages...</p>
        ) : null}

        <div className="grid gap-3">
          {(snapshot?.items ?? []).map((item) => (
            <div
              key={item.package.package_id}
              className="rounded-md border border-border p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold">
                      {item.package.display_name}
                    </h2>
                    <Badge variant="outline">{item.package.package_type}</Badge>
                    <Badge variant="outline">{item.package.trust_tier}</Badge>
                    <Badge variant="outline">{item.package.distribution_status}</Badge>
                    <Badge variant="outline">{item.package.compatibility_state}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.package.package_id}
                  </p>
                  {item.latestRelease ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Latest release {item.latestRelease.package_version}
                    </p>
                  ) : null}
                </div>

                <Link
                  href={
                    projectId
                      ? `/marketplace/${item.package.package_id}?projectId=${projectId}`
                      : `/marketplace/${item.package.package_id}`
                  }
                  className="rounded-md border border-border px-3 py-1 text-sm font-medium hover:bg-muted/20"
                >
                  View package
                </Link>
              </div>

              {item.trustEligibility ? (
                <div className="mt-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  Trust eligibility: {item.trustEligibility.distribution_status} /
                  {' '}
                  {item.trustEligibility.compatibility_state}
                  {item.trustEligibility.block_reason_codes.length > 0
                    ? ` (${item.trustEligibility.block_reason_codes.join(', ')})`
                    : ''}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {item.maintainers.map((maintainer) => (
                  <Badge key={maintainer.maintainer_id} variant="outline">
                    {maintainer.display_name} · {maintainer.verification_state}
                  </Badge>
                ))}
              </div>
            </div>
          ))}

          {!isLoading && (snapshot?.items.length ?? 0) === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">
              No registry packages match the current search and filter posture.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
