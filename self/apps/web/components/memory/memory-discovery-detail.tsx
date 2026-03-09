'use client';

import * as React from 'react';
import type { ProjectKnowledgeSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MemoryDiscoveryDetailProps {
  projectId: string | null;
  snapshot: ProjectKnowledgeSnapshot | null;
  isLoading: boolean;
}

export function MemoryDiscoveryDetail({
  projectId,
  snapshot,
  isLoading,
}: MemoryDiscoveryDetailProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Discovery Detail</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4 text-sm">
        {!projectId ? (
          <p className="text-muted-foreground">
            Select a candidate project to inspect its knowledge snapshot.
          </p>
        ) : isLoading ? (
          <p className="text-muted-foreground">Loading project snapshot...</p>
        ) : !snapshot ? (
          <p className="text-muted-foreground">No persisted knowledge snapshot for this project.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{snapshot.diagnostics.runtimePosture}</Badge>
              {snapshot.diagnostics.refreshInFlight ? (
                <Badge variant="secondary">refresh in flight</Badge>
              ) : null}
            </div>
            <div className="space-y-2">
              <p>Taxonomy tags: {snapshot.taxonomy.length}</p>
              <p>Outgoing relationships: {snapshot.relationships.outgoing.length}</p>
              <p>Incoming relationships: {snapshot.relationships.incoming.length}</p>
              <p>
                Latest refresh:{' '}
                {snapshot.latestRefresh?.completedAt ?? 'no refresh recorded'}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
