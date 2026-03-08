import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export type LearningConfidenceTierFilter = 'all' | 'low' | 'medium' | 'high';
export type LearningDecayStateFilter =
  | 'all'
  | 'stable'
  | 'decaying'
  | 'flagged_retirement';
export type LearningSortField =
  | 'updatedAt'
  | 'confidence'
  | 'supportingSignals'
  | 'sourceCount';
export type LearningSortDirection = 'asc' | 'desc';

export interface LearningFilterState {
  query: string;
  tier: LearningConfidenceTierFilter;
  decayState: LearningDecayStateFilter;
  includeRetired: boolean;
  sortBy: LearningSortField;
  sortDirection: LearningSortDirection;
}

interface MemoryLearningFilterBarProps {
  filters: LearningFilterState;
  onChange: (next: Partial<LearningFilterState>) => void;
  onReset: () => void;
  resultCount: number;
}

export function createDefaultLearningFilters(): LearningFilterState {
  return {
    query: '',
    tier: 'all',
    decayState: 'all',
    includeRetired: false,
    sortBy: 'updatedAt',
    sortDirection: 'desc',
  };
}

export function MemoryLearningFilterBar({
  filters,
  onChange,
  onReset,
  resultCount,
}: MemoryLearningFilterBarProps) {
  return (
    <Card>
      <CardHeader className="gap-3 border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Learning Filters</CardTitle>
          <Button size="sm" variant="ghost" onClick={onReset}>
            Reset
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {resultCount} pattern{resultCount === 1 ? '' : 's'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Search</span>
          <Input
            placeholder="pattern content, tags, lineage ids"
            value={filters.query}
            onChange={(event) => onChange({ query: event.target.value })}
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Confidence tier</span>
            <Select
              value={filters.tier}
              onChange={(event) =>
                onChange({
                  tier: event.target.value as LearningConfidenceTierFilter,
                })
              }
            >
              <option value="all">All tiers</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </Select>
          </label>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">Decay state</span>
            <Select
              value={filters.decayState}
              onChange={(event) =>
                onChange({
                  decayState: event.target.value as LearningDecayStateFilter,
                })
              }
            >
              <option value="all">All decay states</option>
              <option value="stable">Stable</option>
              <option value="decaying">Decaying</option>
              <option value="flagged_retirement">Flagged retirement</option>
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
                  sortBy: event.target.value as LearningSortField,
                })
              }
            >
              <option value="updatedAt">Updated at</option>
              <option value="confidence">Confidence</option>
              <option value="supportingSignals">Supporting signals</option>
              <option value="sourceCount">Source count</option>
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
              {filters.sortDirection === 'desc'
                ? 'Newest / highest first'
                : 'Oldest / lowest first'}
            </Button>
          </div>
        </div>

        <Button
          size="sm"
          variant={filters.includeRetired ? 'default' : 'outline'}
          onClick={() => onChange({ includeRetired: !filters.includeRetired })}
        >
          {filters.includeRetired
            ? 'Including retirement flags'
            : 'Include retirement flags'}
        </Button>
      </CardContent>
    </Card>
  );
}
