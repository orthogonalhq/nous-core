'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { ProjectConfigurationPanel } from '@/components/projects/project-configuration-panel';
import { ProjectDashboard } from '@/components/projects/project-dashboard';
import { ProjectEscalationQueue } from '@/components/projects/project-escalation-queue';
import { WorkflowEditor } from '@/components/projects/workflow-editor';
import { WorkflowMonitor } from '@/components/projects/workflow-monitor';
import { trpc } from '@/lib/trpc';
import { useProject } from '@/lib/project-context';

export default function ProjectsPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-8">
          <p className="text-muted-foreground">Loading workflow surface...</p>
        </div>
      }
    >
      <ProjectsPageContent />
    </React.Suspense>
  );
}

function ProjectsPageContent() {
  const { projectId } = useProject();
  const searchParams = useSearchParams();
  const linkedRunId = searchParams.get('runId');
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(
    linkedRunId,
  );

  React.useEffect(() => {
    setSelectedRunId(linkedRunId);
  }, [linkedRunId]);

  const snapshotQuery = trpc.projects.workflowSnapshot.useQuery(
    {
      projectId: projectId as any,
      runId: selectedRunId ?? undefined,
    },
    {
      enabled: projectId != null,
    },
  );
  const dashboardQuery = trpc.projects.dashboardSnapshot.useQuery(
    {
      projectId: projectId as any,
    },
    {
      enabled: projectId != null,
    },
  );
  const configurationQuery = trpc.projects.configurationSnapshot.useQuery(
    {
      projectId: projectId as any,
    },
    {
      enabled: projectId != null,
    },
  );
  const escalationQueueQuery = trpc.escalations.listProjectQueue.useQuery(
    {
      projectId: projectId as any,
    },
    {
      enabled: projectId != null,
    },
  );

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select a project from the sidebar to monitor and edit workflows.
        </p>
      </div>
    );
  }

  if (
    snapshotQuery.isLoading ||
    dashboardQuery.isLoading ||
    configurationQuery.isLoading ||
    escalationQueueQuery.isLoading ||
    !snapshotQuery.data ||
    !dashboardQuery.data ||
    !configurationQuery.data ||
    !escalationQueueQuery.data
  ) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading project operating surface...</p>
      </div>
    );
  }

  const snapshot = snapshotQuery.data;
  const dashboard = dashboardQuery.data;
  const configuration = configurationQuery.data;
  const escalationQueue = escalationQueueQuery.data;

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Projects Operating Surface</h1>
          <p className="text-sm text-muted-foreground">
            Monitor canonical dashboard state, adjust governed project configuration,
            acknowledge in-app escalations, and inspect linked workflow evidence
            without creating UI-owned truth.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{snapshot.project.type}</Badge>
          <Badge variant="outline">{dashboard.health.overallStatus}</Badge>
          {dashboard.controlProjection ? (
            <Badge variant="outline">
              {dashboard.controlProjection.project_control_state}
            </Badge>
          ) : null}
          {dashboard.health.activeRunStatus ? (
            <Badge variant="outline">{dashboard.health.activeRunStatus}</Badge>
          ) : null}
        </div>
      </div>

      <ProjectDashboard snapshot={dashboard} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <ProjectConfigurationPanel snapshot={configuration} />
        <ProjectEscalationQueue
          queue={escalationQueue}
          blockedActions={dashboard.blockedActions}
        />
      </div>

      <WorkflowMonitor
        snapshot={snapshot}
        selectedRunId={selectedRunId}
        onSelectRun={setSelectedRunId}
        onStartAuthoring={() => {
          setSelectedRunId(null);
        }}
      />

      <WorkflowEditor
        projectId={projectId}
        projectType={snapshot.project.type}
        snapshot={snapshot}
      />
    </div>
  );
}
