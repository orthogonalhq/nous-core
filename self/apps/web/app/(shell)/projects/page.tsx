'use client';

import * as React from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { WorkflowBuilderPanel } from '@nous/ui/panels';
import { useShellContextOptional } from '@nous/ui/components';
import { buildMaoReturnHref, readMaoNavigationContext } from '@/lib/mao-links';

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
  const shell = useShellContextOptional();
  const projectId = shell?.activeProjectId ?? null;
  const onProjectChange = shell?.onProjectChange;
  const searchParams = useSearchParams();
  const linkedProjectId = searchParams.get('projectId');
  const linkedRunId = searchParams.get('runId');
  const linkedNodeId = searchParams.get('nodeId');
  const maoContext = readMaoNavigationContext(searchParams);

  React.useEffect(() => {
    if (linkedProjectId && linkedProjectId !== projectId) {
      onProjectChange?.(linkedProjectId);
    }
  }, [linkedProjectId, projectId, onProjectChange]);

  if (!projectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-muted-foreground">
          Select a project from the navigation panel to monitor and edit workflows.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {maoContext ? (
        <div className="border-b border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          MAO handoff active
          {linkedRunId ? ` for run ${linkedRunId.slice(0, 8)}` : ''}
          {linkedNodeId ? ` and node ${linkedNodeId.slice(0, 8)}` : ''}
          {maoContext.evidenceRef ? ` with evidence ${maoContext.evidenceRef}` : ''}.
          <Link
            href={buildMaoReturnHref(maoContext)}
            className="ml-2 underline underline-offset-4"
          >
            Return to MAO
          </Link>
        </div>
      ) : null}
      <WorkflowBuilderPanel className="flex-1" projectId={projectId} />
    </div>
  );
}
