'use client';

import * as React from 'react';
import type { WorkflowVisualDebugSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface WorkflowVisualDebugPanelProps {
  snapshot: WorkflowVisualDebugSnapshot;
}

export function WorkflowVisualDebugPanel({
  snapshot,
}: WorkflowVisualDebugPanelProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Visual debug summary</span>
          <Badge variant="outline">{snapshot.runtimeAvailability}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="text-sm font-medium">Checkpoint</div>
          <div className="text-sm text-muted-foreground">
            state: {snapshot.checkpointSummary.runCheckpointState}
          </div>
          {snapshot.checkpointSummary.lastPreparedCheckpointId ? (
            <div className="text-xs text-muted-foreground">
              prepared {snapshot.checkpointSummary.lastPreparedCheckpointId.slice(0, 8)}...
            </div>
          ) : null}
          {snapshot.checkpointSummary.lastCommittedCheckpointId ? (
            <div className="text-xs text-muted-foreground">
              committed {snapshot.checkpointSummary.lastCommittedCheckpointId.slice(0, 8)}...
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="text-sm font-medium">Scheduler</div>
          <div className="text-sm text-muted-foreground">
            enabled {snapshot.schedulerSummary.enabledScheduleCount}
          </div>
          <div className="text-xs text-muted-foreground">
            overdue {snapshot.schedulerSummary.overdueScheduleCount}
          </div>
          {snapshot.schedulerSummary.triggerContext ? (
            <div className="text-xs text-muted-foreground">
              trigger {snapshot.schedulerSummary.triggerContext.triggerType}
            </div>
          ) : null}
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="text-sm font-medium">Artifacts and traces</div>
          <div className="text-sm text-muted-foreground">
            artifacts {snapshot.recentArtifacts.length}
          </div>
          <div className="text-xs text-muted-foreground">
            traces {snapshot.recentTraces.length}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="text-sm font-medium">Projection parity</div>
          <div className="text-sm text-muted-foreground">
            {snapshot.diagnostics.graphProjectionParity}
          </div>
          {snapshot.diagnostics.degradedReasonCode ? (
            <div className="text-xs text-muted-foreground">
              {snapshot.diagnostics.degradedReasonCode}
            </div>
          ) : null}
          {snapshot.controlProjection ? (
            <div className="text-xs text-muted-foreground">
              control {snapshot.controlProjection.project_control_state}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
