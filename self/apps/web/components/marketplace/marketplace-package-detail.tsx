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
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-base">Install Wizard</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
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
            <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
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
