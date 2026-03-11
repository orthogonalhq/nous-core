'use client';

import * as React from 'react';
import Link from 'next/link';
import type { RegistryPackageDetailSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MarketplacePackageDetailProps {
  snapshot: RegistryPackageDetailSnapshot;
}

export function MarketplacePackageDetail({
  snapshot,
}: MarketplacePackageDetailProps) {
  const projectsLink = snapshot.deepLinks.find((link) => link.target === 'projects');
  const maoLink = snapshot.deepLinks.find((link) => link.target === 'mao');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="flex flex-wrap items-center justify-between gap-3 text-base">
            <span>{snapshot.package.display_name}</span>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{snapshot.package.trust_tier}</Badge>
              <Badge variant="outline">{snapshot.package.distribution_status}</Badge>
              <Badge variant="outline">{snapshot.package.compatibility_state}</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <p className="text-sm text-muted-foreground">{snapshot.package.package_id}</p>
          {snapshot.latestRelease ? (
            <div className="rounded-md border border-border p-3 text-sm">
              Latest release {snapshot.latestRelease.package_version} · origin{' '}
              {snapshot.latestRelease.origin_class}
            </div>
          ) : null}
          {snapshot.trustEligibility ? (
            <div className="rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
              Project trust eligibility: {snapshot.trustEligibility.distribution_status} /
              {' '}
              {snapshot.trustEligibility.compatibility_state}
              {snapshot.trustEligibility.block_reason_codes.length > 0
                ? ` (${snapshot.trustEligibility.block_reason_codes.join(', ')})`
                : ''}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {projectsLink?.projectId ? (
              <Link
                href={`/projects?source=marketplace&projectId=${projectsLink.projectId}&packageId=${snapshot.package.package_id}`}
                className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted/20"
              >
                Open Projects
              </Link>
            ) : null}
            {maoLink?.projectId ? (
              <Link
                href={`/mao?source=marketplace&projectId=${maoLink.projectId}&packageId=${snapshot.package.package_id}`}
                className="rounded-md border border-border px-3 py-1 text-sm hover:bg-muted/20"
              >
                Open MAO
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Maintainers and provenance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {snapshot.maintainers.map((maintainer) => (
            <div key={maintainer.maintainer_id} className="rounded-md border border-border p-3 text-sm">
              <div className="font-medium">{maintainer.display_name}</div>
              <div className="text-muted-foreground">
                {maintainer.verification_state} · {maintainer.roles.join(', ')}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Release history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {snapshot.releases.map((release) => (
            <div key={release.release_id} className="rounded-md border border-border p-3 text-sm">
              <div className="font-medium">{release.package_version}</div>
              <div className="text-muted-foreground">
                {release.distribution_status} · {release.compatibility_state}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Moderation and appeals</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-2">
          <div className="space-y-3">
            {snapshot.governanceTimeline.map((action) => (
              <div key={action.action_id} className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium">{action.action_type}</div>
                <div className="text-muted-foreground">{action.reason_code}</div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {snapshot.appeals.map((appeal) => (
              <div key={appeal.appeal_id} className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium">{appeal.status}</div>
                <div className="text-muted-foreground">{appeal.submitted_reason}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
