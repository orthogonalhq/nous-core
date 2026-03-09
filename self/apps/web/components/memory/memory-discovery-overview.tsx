'use client';

import * as React from 'react';
import type { ProjectDiscoveryResult } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MemoryDiscoveryOverviewProps {
  result: ProjectDiscoveryResult | null;
  isLoading: boolean;
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function MemoryDiscoveryOverview({
  result,
  isLoading,
  selectedProjectId,
  onSelect,
  onRefresh,
  isRefreshing,
}: MemoryDiscoveryOverviewProps) {
  const candidates = result?.discovery.results ?? [];

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">Discovery Results</CardTitle>
          <Button onClick={onRefresh} disabled={isRefreshing}>
            {isRefreshing ? 'Refreshing...' : 'Refresh knowledge'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading discovery results...</p>
        ) : candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No candidates yet. Enter a query to inspect related projects.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">
                denied {result?.policy.deniedProjectCount ?? 0}
              </Badge>
              {(result?.policy.reasonCodes ?? []).map((reasonCode) => (
                <Badge key={reasonCode} variant="secondary">
                  {reasonCode}
                </Badge>
              ))}
            </div>
            <div className="space-y-3">
              {candidates.map((candidate) => (
                <button
                  key={candidate.projectId}
                  type="button"
                  onClick={() => onSelect(candidate.projectId)}
                  className={`w-full rounded-md border p-3 text-left text-sm ${
                    selectedProjectId === candidate.projectId
                      ? 'border-foreground bg-muted/30'
                      : 'border-border'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{candidate.projectId}</span>
                    <Badge variant="outline">rank {candidate.rank}</Badge>
                  </div>
                  <p className="mt-2 text-muted-foreground">
                    combined score {candidate.combinedScore.toFixed(3)}
                  </p>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
