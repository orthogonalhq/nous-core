'use client';

import * as React from 'react';
import Link from 'next/link';
import type {
  AppSettingsPreparation,
  RegistryPackageDetailSnapshot,
} from '@nous/shared';
import { AppSettingsSurface, InstallWizard } from '@nous/ui';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

const sectionStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-3xl)',
};

const headerDividerStyle: React.CSSProperties = {
  borderBottom: '1px solid var(--nous-shell-column-border)',
};

const cardContentTopStyle: React.CSSProperties = {
  paddingTop: 'var(--nous-space-2xl)',
};

const contentStackStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-2xl)',
  paddingTop: 'var(--nous-space-2xl)',
};

const borderedPanelStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
};

const mutedPanelStyle: React.CSSProperties = {
  ...borderedPanelStyle,
  background: 'var(--nous-bg-hover)',
  color: 'var(--nous-text-secondary)',
};

const titleRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-base)',
};

const rowWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--nous-space-md)',
};

const mutedTextStyle: React.CSSProperties = {
  fontSize: 'var(--nous-font-size-sm)',
  color: 'var(--nous-text-secondary)',
};

const actionLinkStyle: React.CSSProperties = {
  borderRadius: 'var(--nous-radius-md)',
  border: '1px solid var(--nous-shell-column-border)',
  padding: 'var(--nous-space-xs) var(--nous-space-xl)',
  fontSize: 'var(--nous-font-size-sm)',
};

const cardColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--nous-space-xl)',
};

const responsiveTwoColumnStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--nous-space-xl)',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 18rem), 1fr))',
  paddingTop: 'var(--nous-space-2xl)',
};

const itemTitleStyle: React.CSSProperties = {
  fontWeight: 'var(--nous-font-weight-medium)',
};

const itemMutedStyle: React.CSSProperties = {
  color: 'var(--nous-text-secondary)',
};

interface MarketplacePackageDetailProps {
  snapshot: RegistryPackageDetailSnapshot;
  projectId?: string;
}

export function MarketplacePackageDetail({
  snapshot,
  projectId,
}: MarketplacePackageDetailProps) {
  const projectsLink = snapshot.deepLinks.find((link) => link.target === 'projects');
  const maoLink = snapshot.deepLinks.find((link) => link.target === 'mao');
  const installPreparationQuery = trpc.packages.prepareAppInstall.useQuery(
    {
      project_id: projectId as any,
      package_id: snapshot.package.package_id,
      release_id: snapshot.latestRelease?.release_id,
    },
    {
      enabled: Boolean(projectId && snapshot.latestRelease?.release_id),
    },
  );
  const settingsPreparationQuery = trpc.packages.prepareAppSettings.useQuery(
    {
      project_id: projectId as any,
      package_id: snapshot.package.package_id,
    },
    {
      enabled: Boolean(projectId),
      retry: false,
    },
  );
  const installAppMutation = trpc.packages.installApp.useMutation();
  const saveAppSettingsMutation = trpc.packages.saveAppSettings.useMutation();

  const syncPanels = React.useCallback((preparation?: AppSettingsPreparation | null) => {
    if (!preparation || typeof window === 'undefined') {
      return
    }

    window.dispatchEvent(
      new CustomEvent('nous:app-settings-changed', {
        detail: {
          appId: preparation.app_id,
          configVersion: preparation.config_version,
          configSnapshot: preparation.panel_config_snapshot,
        },
      }),
    )
  }, [])

  return (
    <div style={sectionStackStyle}>
      <Card>
        <CardHeader style={headerDividerStyle}>
          <CardTitle style={{ fontSize: 'var(--nous-font-size-base)' }}>Install Wizard</CardTitle>
        </CardHeader>
        <CardContent style={cardContentTopStyle}>
          {projectId && settingsPreparationQuery.data ? (
            <AppSettingsSurface
              preparation={settingsPreparationQuery.data}
              actorId="web-marketplace"
              onSave={(request) => saveAppSettingsMutation.mutateAsync(request)}
              disabled={settingsPreparationQuery.isLoading || saveAppSettingsMutation.isPending}
              onSaved={async () => {
                const refreshed = await settingsPreparationQuery.refetch()
                syncPanels(refreshed.data)
              }}
            />
          ) : projectId && installPreparationQuery.data ? (
            <InstallWizard
              preparation={installPreparationQuery.data}
              projectId={projectId}
              actorId="web-marketplace"
              onInstall={(request) => installAppMutation.mutateAsync(request)}
              onResult={async (result) => {
                if (result.status === 'failed') {
                  return
                }
                const refreshed = await settingsPreparationQuery.refetch()
                syncPanels(refreshed.data)
              }}
              disabled={installPreparationQuery.isLoading || installAppMutation.isPending}
            />
          ) : (
            <div style={{ ...mutedPanelStyle, padding: 'var(--nous-space-2xl)' }}>
              {projectId
                ? settingsPreparationQuery.error
                  ? 'Preparing the canonical settings or install contract...'
                  : 'Preparing the canonical install contract...'
                : 'Open this package with a project context to run the approval-gated install wizard.'}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader style={headerDividerStyle}>
          <CardTitle style={titleRowStyle}>
            <span>{snapshot.package.display_name}</span>
            <div style={rowWrapStyle}>
              <Badge variant="outline">{snapshot.package.trust_tier}</Badge>
              <Badge variant="outline">{snapshot.package.distribution_status}</Badge>
              <Badge variant="outline">{snapshot.package.compatibility_state}</Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent style={contentStackStyle}>
          <p style={mutedTextStyle}>{snapshot.package.package_id}</p>
          {snapshot.latestRelease ? (
            <div style={borderedPanelStyle}>
              Latest release {snapshot.latestRelease.package_version} · origin{' '}
              {snapshot.latestRelease.origin_class}
            </div>
          ) : null}
          {snapshot.trustEligibility ? (
            <div style={mutedPanelStyle}>
              Project trust eligibility: {snapshot.trustEligibility.distribution_status} /
              {' '}
              {snapshot.trustEligibility.compatibility_state}
              {snapshot.trustEligibility.block_reason_codes.length > 0
                ? ` (${snapshot.trustEligibility.block_reason_codes.join(', ')})`
                : ''}
            </div>
          ) : null}
          <div style={rowWrapStyle}>
            {projectsLink?.projectId ? (
              <Link
                href={`/projects?source=marketplace&projectId=${projectsLink.projectId}&packageId=${snapshot.package.package_id}`}
                style={actionLinkStyle}
              >
                Open Projects
              </Link>
            ) : null}
            {maoLink?.projectId ? (
              <Link
                href={`/mao?source=marketplace&projectId=${maoLink.projectId}&packageId=${snapshot.package.package_id}`}
                style={actionLinkStyle}
              >
                Open MAO
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader style={headerDividerStyle}>
          <CardTitle style={{ fontSize: 'var(--nous-font-size-base)' }}>Maintainers and provenance</CardTitle>
        </CardHeader>
        <CardContent style={contentStackStyle}>
          {snapshot.maintainers.map((maintainer) => (
            <div key={maintainer.maintainer_id} style={borderedPanelStyle}>
              <div style={itemTitleStyle}>{maintainer.display_name}</div>
              <div style={itemMutedStyle}>
                {maintainer.verification_state} · {maintainer.roles.join(', ')}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader style={headerDividerStyle}>
          <CardTitle style={{ fontSize: 'var(--nous-font-size-base)' }}>Release history</CardTitle>
        </CardHeader>
        <CardContent style={contentStackStyle}>
          {snapshot.releases.map((release) => (
            <div key={release.release_id} style={borderedPanelStyle}>
              <div style={itemTitleStyle}>{release.package_version}</div>
              <div style={itemMutedStyle}>
                {release.distribution_status} · {release.compatibility_state}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader style={headerDividerStyle}>
          <CardTitle style={{ fontSize: 'var(--nous-font-size-base)' }}>Moderation and appeals</CardTitle>
        </CardHeader>
        <CardContent style={responsiveTwoColumnStyle}>
          <div style={cardColumnStyle}>
            {snapshot.governanceTimeline.map((action) => (
              <div key={action.action_id} style={borderedPanelStyle}>
                <div style={itemTitleStyle}>{action.action_type}</div>
                <div style={itemMutedStyle}>{action.reason_code}</div>
              </div>
            ))}
          </div>
          <div style={cardColumnStyle}>
            {snapshot.appeals.map((appeal) => (
              <div key={appeal.appeal_id} style={borderedPanelStyle}>
                <div style={itemTitleStyle}>{appeal.status}</div>
                <div style={itemMutedStyle}>{appeal.submitted_reason}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
