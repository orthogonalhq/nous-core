'use client';

import * as React from 'react';
import type {
  MaoProjectControlAction,
  MaoProjectControlResult,
  MaoProjectSnapshot,
} from '@nous/shared';
import { Badge } from '../badge';
import { Button } from '../button';
import { Card, CardContent, CardHeader, CardTitle } from '../card';

const COMMAND_IDS: Record<MaoProjectControlAction, string> = {
  pause_project: '6f139b92-f4fc-49b9-a1df-2d6b8149b001',
  resume_project: '6f139b92-f4fc-49b9-a1df-2d6b8149b002',
  hard_stop_project: '6f139b92-f4fc-49b9-a1df-2d6b8149b003',
};

export interface MaoProjectControlsProps {
  snapshot: MaoProjectSnapshot;
  pending: boolean;
  lastResult: MaoProjectControlResult | null;
  onRequestControl: (input: {
    action: MaoProjectControlAction;
    reason: string;
    commandId: string;
  }) => void;
}

export function MaoProjectControls({
  snapshot,
  pending,
  lastResult,
  onRequestControl,
}: MaoProjectControlsProps) {
  const [reason, setReason] = React.useState('');
  const control = snapshot.controlProjection;
  const activeRunCount = snapshot.workflowRunId ? 1 : 0;
  const reasonTrimmed = reason.trim();

  const controlButtons: Array<{
    action: MaoProjectControlAction;
    label: string;
    disabled: boolean;
  }> = [
    {
      action: 'pause_project',
      label: 'Pause Project',
      disabled:
        pending ||
        control.project_control_state === 'paused_review' ||
        control.project_control_state === 'hard_stopped',
    },
    {
      action: 'resume_project',
      label: 'Resume Project',
      disabled: pending || control.project_control_state === 'running',
    },
    {
      action: 'hard_stop_project',
      label: 'Hard Stop Project',
      disabled: pending || control.project_control_state === 'hard_stopped',
    },
  ];

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Project controls</span>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{control.project_control_state}</Badge>
            <Badge variant="outline">{control.pfc_project_recommendation}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4 text-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Resume readiness
            </div>
            <div className="mt-1">{control.resume_readiness_status}</div>
            {control.resume_readiness_reason_code ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {control.resume_readiness_reason_code}
              </div>
            ) : null}
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Last action
            </div>
            <div className="mt-1">
              {control.project_last_control_action ?? 'n/a'}
            </div>
            {control.project_last_control_reason ? (
              <div className="mt-1 text-xs text-muted-foreground">
                {control.project_last_control_reason}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-md border border-border p-3">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Impact summary
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <div>active runs: {activeRunCount}</div>
            <div>active agents: {snapshot.summary.activeAgentCount}</div>
            <div>blocked agents: {snapshot.summary.blockedAgentCount}</div>
            <div>urgent agents: {snapshot.summary.urgentAgentCount}</div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="mao-control-reason">
            Control reason
          </label>
          <textarea
            id="mao-control-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Capture the operator reason for this project-scope control."
            className="min-h-24 w-full rounded-md border border-border bg-background px-3 py-2"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {controlButtons.map((button) => (
            <Button
              key={button.action}
              disabled={button.disabled || !reasonTrimmed}
              onClick={() =>
                onRequestControl({
                  action: button.action,
                  reason: reasonTrimmed,
                  commandId: COMMAND_IDS[button.action],
                })
              }
            >
              {button.label}
            </Button>
          ))}
        </div>

        {lastResult ? (
          <div className="rounded-md border border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Last result</span>
              <Badge variant="outline">{lastResult.status}</Badge>
              <Badge variant="outline">{lastResult.to_state}</Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {lastResult.reason_code} • {lastResult.decision_ref}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
