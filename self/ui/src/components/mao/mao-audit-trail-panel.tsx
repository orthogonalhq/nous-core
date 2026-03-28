'use client';

import * as React from 'react';
import type { ProjectId } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { trpc, useEventSubscription } from '@nous/transport';

export interface MaoAuditTrailPanelProps {
  projectId: ProjectId | null;
}

export function MaoAuditTrailPanel({ projectId }: MaoAuditTrailPanelProps) {
  const utils = trpc.useUtils();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const auditQuery = trpc.mao.getControlAuditHistory.useQuery(
    { projectId: projectId as string },
    { enabled: !!projectId },
  );

  useEventSubscription({
    channels: ['mao:control-action'],
    onEvent: () => {
      void utils.mao.getControlAuditHistory.invalidate();
    },
    enabled: !!projectId,
  });

  const entries = auditQuery.data ?? [];

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Audit trail</span>
          {entries.length > 0 ? (
            <Badge variant="outline">{entries.length} entries</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4 text-sm">
        {auditQuery.isLoading ? (
          <p className="text-muted-foreground">Loading audit history...</p>
        ) : auditQuery.isError ? (
          <p className="text-muted-foreground">
            Failed to load audit history.
          </p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground">
            No control actions have been recorded for this project.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.commandId;

              return (
                <button
                  key={entry.commandId}
                  type="button"
                  className="w-full rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-muted/20"
                  onClick={() =>
                    setExpandedId(isExpanded ? null : entry.commandId)
                  }
                  aria-expanded={isExpanded}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {entry.action.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {entry.actorId}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.at).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {entry.reason}
                  </div>

                  {isExpanded ? (
                    <div className="mt-3 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                      <div>
                        <span className="font-medium">Command ID:</span>{' '}
                        {entry.commandId}
                      </div>
                      <div>
                        <span className="font-medium">Reason code:</span>{' '}
                        {entry.reasonCode}
                      </div>
                      <div>
                        <span className="font-medium">Resume readiness:</span>{' '}
                        {entry.resumeReadinessStatus}
                      </div>
                      <div>
                        <span className="font-medium">Decision ref:</span>{' '}
                        {entry.decisionRef}
                      </div>
                      {entry.evidenceRefs.length > 0 ? (
                        <div>
                          <span className="font-medium">Evidence refs:</span>{' '}
                          {entry.evidenceRefs.join(', ')}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
