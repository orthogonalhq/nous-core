'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export interface WorkflowDigestState {
  query: string;
  status:
    | 'all'
    | 'pending'
    | 'ready'
    | 'running'
    | 'waiting'
    | 'completed'
    | 'blocked'
    | 'failed'
    | 'degraded';
  groupBy: 'status' | 'type';
  hideCompleted: boolean;
}

export function createDefaultWorkflowDigestState(): WorkflowDigestState {
  return {
    query: '',
    status: 'all',
    groupBy: 'status',
    hideCompleted: false,
  };
}

interface WorkflowDigestControlsProps {
  state: WorkflowDigestState;
  nodeCount: number;
  onChange: (next: Partial<WorkflowDigestState>) => void;
}

export function WorkflowDigestControls({
  state,
  nodeCount,
  onChange,
}: WorkflowDigestControlsProps) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_12rem_12rem_auto]">
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Filter nodes</span>
        <Input
          aria-label="Filter nodes"
          value={state.query}
          onChange={(event) => onChange({ query: event.target.value })}
          placeholder="Search node name or id"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Status</span>
        <Select
          aria-label="Node status filter"
          value={state.status}
          onChange={(event) =>
            onChange({ status: event.target.value as WorkflowDigestState['status'] })
          }
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="ready">Ready</option>
          <option value="running">Running</option>
          <option value="waiting">Waiting</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
          <option value="failed">Failed</option>
          <option value="degraded">Degraded</option>
        </Select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">Group by</span>
        <Select
          aria-label="Node grouping"
          value={state.groupBy}
          onChange={(event) =>
            onChange({ groupBy: event.target.value as WorkflowDigestState['groupBy'] })
          }
        >
          <option value="status">Status</option>
          <option value="type">Node type</option>
        </Select>
      </label>
      <label className="flex items-end gap-2 text-sm">
        <input
          aria-label="Hide completed nodes"
          type="checkbox"
          checked={state.hideCompleted}
          onChange={(event) => onChange({ hideCompleted: event.target.checked })}
        />
        <span className="pb-2 text-muted-foreground">
          Hide completed ({nodeCount})
        </span>
      </label>
    </div>
  );
}
