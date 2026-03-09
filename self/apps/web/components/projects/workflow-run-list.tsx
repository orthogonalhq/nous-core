'use client';

import * as React from 'react';
import type { WorkflowRunState } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WorkflowRunListProps {
  runtimeAvailability: 'live' | 'no_active_run' | 'degraded_runtime_unavailable';
  recentRuns: WorkflowRunState[];
  selectedRunId: string | null;
  onSelectRun: (runId: string | null) => void;
}

export function WorkflowRunList({
  runtimeAvailability,
  recentRuns,
  selectedRunId,
  onSelectRun,
}: WorkflowRunListProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Run monitor</span>
          <Badge variant="outline">{runtimeAvailability}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {!recentRuns.length ? (
          <p className="text-sm text-muted-foreground">
            No in-process workflow runs are currently available for this project.
          </p>
        ) : (
          <>
            <Button
              variant={selectedRunId == null ? 'default' : 'outline'}
              size="sm"
              onClick={() => onSelectRun(null)}
            >
              Follow current selection
            </Button>
            <div className="space-y-2">
              {recentRuns.map((run) => (
                <button
                  key={run.runId}
                  type="button"
                  onClick={() => onSelectRun(run.runId)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                    selectedRunId === run.runId
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{run.status}</span>
                    <span className="text-xs text-muted-foreground">
                      {run.runId.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    version {run.workflowVersion} • updated {run.updatedAt}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
