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

const cardHeaderStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--nous-shell-column-border)',
};

const cardTitleStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  fontSize: 'var(--nous-font-size-base)',
};

const rowWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--nous-space-xs)',
};

const contentStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-md)',
  paddingTop: 'var(--nous-space-md)',
};

const mutedTextStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
};

const packageCardStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-md)',
};

const packageHeaderStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
};

const packageTitleRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--nous-space-xs)',
};

const titleStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-base)',
  fontWeight: 'var(--nous-font-weight-semibold)',
};

const actionLinkStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-sm)',
  fontWeight: 'var(--nous-font-weight-medium)',
};

const eligibilityStyle: React.CSSProperties = {
  marginTop: '12px',
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  background: 'var(--nous-bg-hover)',
  padding: 'var(--nous-space-sm) var(--nous-space-md)',
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
};

const emptyStateStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px dashed var(--nous-shell-column-border)',
  padding: 'var(--nous-space-3xl)',
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
};

export function MarketplaceBrowser({
  query,
  onQueryChange,
  snapshot,
  isLoading,
  projectId,
}: MarketplaceBrowserProps) {
  return (
    <Card>
      <CardHeader style={cardHeaderStyle}>
        <CardTitle style={cardTitleStyle}>
          <span>Marketplace browser</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-xs)' }}>
            <Badge variant="outline">
              {snapshot?.totalCount ?? 0} package
              {(snapshot?.totalCount ?? 0) === 1 ? '' : 's'}
            </Badge>
            {projectId ? <Badge variant="outline">project scoped</Badge> : null}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent style={contentStyle}>
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search registry packages"
          aria-label="Search registry packages"
        />

        {isLoading ? <p style={mutedTextStyle}>Loading registry packages...</p> : null}

        <div style={{ display: 'grid', gap: '12px' }}>
          {(snapshot?.items ?? []).map((item) => (
            <div key={item.package.package_id} style={packageCardStyle}>
              <div style={packageHeaderStyle}>
                <div>
                  <div style={packageTitleRowStyle}>
                    <h2 style={titleStyle}>{item.package.display_name}</h2>
                    <Badge variant="outline">{item.package.package_type}</Badge>
                    <Badge variant="outline">{item.package.trust_tier}</Badge>
                    <Badge variant="outline">{item.package.distribution_status}</Badge>
                    <Badge variant="outline">{item.package.compatibility_state}</Badge>
                  </div>
                  <p style={{ ...mutedTextStyle, marginTop: '4px' }}>
                    {item.package.package_id}
                  </p>
                  {item.latestRelease ? (
                    <p style={{ ...mutedTextStyle, marginTop: 'var(--nous-space-xs)' }}>
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
                  style={actionLinkStyle}
                >
                  View package
                </Link>
              </div>

              {item.trustEligibility ? (
                <div style={eligibilityStyle}>
                  Trust eligibility: {item.trustEligibility.distribution_status} /{' '}
                  {item.trustEligibility.compatibility_state}
                  {item.trustEligibility.block_reason_codes.length > 0
                    ? ` (${item.trustEligibility.block_reason_codes.join(', ')})`
                    : ''}
                </div>
              ) : null}

              <div style={{ ...rowWrapStyle, marginTop: '12px' }}>
                {item.maintainers.map((maintainer) => (
                  <Badge key={maintainer.maintainer_id} variant="outline">
                    {maintainer.display_name} · {maintainer.verification_state}
                  </Badge>
                ))}
              </div>
            </div>
          ))}

          {!isLoading && (snapshot?.items.length ?? 0) === 0 ? (
            <div style={emptyStateStyle}>
              No registry packages match the current search and filter posture.
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
