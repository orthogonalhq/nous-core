'use client';

import * as React from 'react';
import type { ProjectDashboardSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProjectDashboardProps {
  snapshot: ProjectDashboardSnapshot;
}

export function ProjectDashboard({ snapshot }: ProjectDashboardProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Project dashboard</span>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{snapshot.health.overallStatus}</Badge>
            <Badge variant="outline">{snapshot.health.runtimeAvailability}</Badge>
            {snapshot.controlProjection ? (
              <Badge variant="outline">
                {snapshot.controlProjection.project_control_state}
              </Badge>
            ) : null}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 pt-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Health
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {snapshot.health.overallStatus}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Active run: {snapshot.health.activeRunStatus ?? 'none'}
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Workflow posture
          </div>
          <div className="mt-2 text-sm">
            <div>blocked nodes: {snapshot.health.blockedNodeCount}</div>
            <div>waiting nodes: {snapshot.health.waitingNodeCount}</div>
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Schedule posture
          </div>
          <div className="mt-2 text-sm">
            <div>enabled schedules: {snapshot.health.enabledScheduleCount}</div>
            <div>overdue schedules: {snapshot.health.overdueScheduleCount}</div>
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Escalation posture
          </div>
          <div className="mt-2 text-sm">
            <div>open escalations: {snapshot.health.openEscalationCount}</div>
            <div>urgent escalations: {snapshot.health.urgentEscalationCount}</div>
          </div>
        </div>

        <div className="rounded-md border border-border p-3 md:col-span-2 xl:col-span-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Blocked action feedback
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {snapshot.blockedActions.map((action) => (
              <div
                key={action.action}
                className="rounded-md border border-border px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{action.action}</span>
                  <Badge variant="outline">
                    {action.allowed ? 'allowed' : action.reasonCode ?? 'blocked'}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{action.message}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
