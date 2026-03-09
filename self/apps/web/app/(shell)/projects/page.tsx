'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
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

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select a project from the sidebar to monitor and edit workflows.
        </p>
      </div>
    );
  }

  if (snapshotQuery.isLoading || !snapshotQuery.data) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading workflow surface...</p>
      </div>
    );
  }

  const snapshot = snapshotQuery.data;

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Projects Workflow Surface</h1>
          <p className="text-sm text-muted-foreground">
            Monitor canonical run state, inspect linked evidence, and update the
            project workflow definition without creating UI-owned truth.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{snapshot.project.type}</Badge>
          <Badge variant="outline">{snapshot.runtimeAvailability}</Badge>
          {snapshot.activeRunState ? (
            <Badge variant="outline">{snapshot.activeRunState.status}</Badge>
          ) : null}
        </div>
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
