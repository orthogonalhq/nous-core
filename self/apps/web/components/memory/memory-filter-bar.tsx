import * as React from 'react';
import type {
  MemoryLifecycleStatus,
  MemoryPlacementState,
  MemoryType,
} from '@nous/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export type MemoryInspectorScope = 'project' | 'global' | 'all';
export type MemoryInspectorSortField =
  | 'updatedAt'
  | 'createdAt'
  | 'confidence'
  | 'type'
  | 'sentiment';
export type MemoryInspectorSortDirection = 'asc' | 'desc';

export interface MemoryFilterState {
  query: string;
  tags: string;
  scope: MemoryInspectorScope;
  type: MemoryType | 'all';
  lifecycleStatus: MemoryLifecycleStatus | 'all';
  placementState: MemoryPlacementState | 'all';
  includeSuperseded: boolean;
  includeDeleted: boolean;
  sortBy: MemoryInspectorSortField;
  sortDirection: MemoryInspectorSortDirection;
}

interface MemoryFilterBarProps {
  filters: MemoryFilterState;
  onChange: (next: Partial<MemoryFilterState>) => void;
  onReset: () => void;
  resultCount: number;
}

const MEMORY_TYPE_OPTIONS: Array<MemoryType | 'all'> = [
  'all',
  'fact',
  'preference',
  'experience-record',
  'distilled-pattern',
  'task-state',
];

const LIFECYCLE_OPTIONS: Array<MemoryLifecycleStatus | 'all'> = [
  'all',
  'active',
  'superseded',
  'soft-deleted',
  'hard-deleted',
];

const PLACEMENT_OPTIONS: Array<MemoryPlacementState | 'all'> = [
  'all',
  'project',
  'global-probation',
  'global-stable',
];

export function createDefaultMemoryFilters(): MemoryFilterState {
  return {
    query: '',
    tags: '',
    scope: 'project',
    type: 'all',
    lifecycleStatus: 'all',
    placementState: 'all',
    includeSuperseded: false,
    includeDeleted: false,
    sortBy: 'updatedAt',
    sortDirection: 'desc',
  };
}

export function MemoryFilterBar({
  filters,
  onChange,
  onReset,
  resultCount,
}: MemoryFilterBarProps) {
  return (
    <Card>
      <CardHeader className="gap-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Search and Filters</CardTitle>
          <Button size="sm" variant="ghost" onClick={onReset}>
            Reset
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {resultCount} result{resultCount === 1 ? '' : 's'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Search</span>
          <Input
            placeholder="content, tags, provenance, structured fields"
            value={filters.query}
            onChange={(event) => onChange({ query: event.target.value })}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <span className="font-medium">Tags</span>
          <Input
            placeholder="comma-separated tags"
            value={filters.tags}
            onChange={(event) => onChange({ tags: event.target.value })}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Scope</span>
            <Select
              value={filters.scope}
              onChange={(event) =>
                onChange({
                  scope: event.target.value as MemoryInspectorScope,
                })
              }
            >
              <option value="project">Project only</option>
              <option value="global">Global only</option>
              <option value="all">Project + global</option>
            </Select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Type</span>
            <Select
              value={filters.type}
              onChange={(event) =>
                onChange({ type: event.target.value as MemoryType | 'all' })
              }
            >
              {MEMORY_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All types' : option}
                </option>
              ))}
            </Select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Lifecycle</span>
            <Select
              value={filters.lifecycleStatus}
              onChange={(event) =>
                onChange({
                  lifecycleStatus: event.target.value as
                    | MemoryLifecycleStatus
                    | 'all',
                })
              }
            >
              {LIFECYCLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'Default active view' : option}
                </option>
              ))}
            </Select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Placement</span>
            <Select
              value={filters.placementState}
              onChange={(event) =>
                onChange({
                  placementState: event.target.value as
                    | MemoryPlacementState
                    | 'all',
                })
              }
            >
              {PLACEMENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All placements' : option}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Sort by</span>
            <Select
              value={filters.sortBy}
              onChange={(event) =>
                onChange({
                  sortBy: event.target.value as MemoryInspectorSortField,
                })
              }
            >
              <option value="updatedAt">Updated at</option>
              <option value="createdAt">Created at</option>
              <option value="confidence">Confidence</option>
              <option value="type">Type</option>
              <option value="sentiment">Sentiment</option>
            </Select>
          </label>

          <div className="space-y-1 text-sm">
            <span className="font-medium">Direction</span>
            <Button
              className="w-full"
              variant="outline"
              onClick={() =>
                onChange({
                  sortDirection: filters.sortDirection === 'desc' ? 'asc' : 'desc',
                })
              }
            >
              {filters.sortDirection === 'desc' ? 'Newest / highest first' : 'Oldest / lowest first'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filters.includeSuperseded ? 'default' : 'outline'}
            onClick={() =>
              onChange({ includeSuperseded: !filters.includeSuperseded })
            }
          >
            {filters.includeSuperseded ? 'Including superseded' : 'Include superseded'}
          </Button>
          <Button
            size="sm"
            variant={filters.includeDeleted ? 'default' : 'outline'}
            onClick={() => onChange({ includeDeleted: !filters.includeDeleted })}
          >
            {filters.includeDeleted ? 'Including deleted' : 'Include deleted'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
