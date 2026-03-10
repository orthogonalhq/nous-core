'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface DiscoveryFilterState {
  query: string;
  topK: number;
  includeTaxonomy: boolean;
  includeRelationships: boolean;
}

export function createDefaultDiscoveryFilters(): DiscoveryFilterState {
  return {
    query: '',
    topK: 5,
    includeTaxonomy: true,
    includeRelationships: true,
  };
}

interface MemoryDiscoveryFilterBarProps {
  filters: DiscoveryFilterState;
  onChange: (next: Partial<DiscoveryFilterState>) => void;
  onReset: () => void;
}

export function MemoryDiscoveryFilterBar({
  filters,
  onChange,
  onReset,
}: MemoryDiscoveryFilterBarProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Discovery Filters</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <label className="block space-y-2 text-sm">
          <span>Discovery query</span>
          <Input
            aria-label="Discovery query"
            value={filters.query}
            onChange={(event) => onChange({ query: event.target.value })}
            placeholder="Search related projects"
          />
        </label>

        <label className="block space-y-2 text-sm">
          <span>Top K</span>
          <Input
            aria-label="Discovery top k"
            type="number"
            min={1}
            max={25}
            value={filters.topK}
            onChange={(event) =>
              onChange({ topK: Number.parseInt(event.target.value || '5', 10) || 5 })
            }
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            aria-label="Include taxonomy"
            type="checkbox"
            checked={filters.includeTaxonomy}
            onChange={(event) =>
              onChange({ includeTaxonomy: event.target.checked })
            }
          />
          <span>Include taxonomy boost</span>
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            aria-label="Include relationships"
            type="checkbox"
            checked={filters.includeRelationships}
            onChange={(event) =>
              onChange({ includeRelationships: event.target.checked })
            }
          />
          <span>Include relationship boost</span>
        </label>

        <Button variant="ghost" onClick={onReset}>
          Reset discovery filters
        </Button>
      </CardContent>
    </Card>
  );
}
