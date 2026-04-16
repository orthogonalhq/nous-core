'use client';

import * as React from 'react';
import type { ProjectId } from '@nous/shared';
import { SYSTEM_SCOPE_SENTINEL_PROJECT_ID } from '@nous/shared';
import { Badge } from '../badge';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { trpc, useEventSubscription } from '@nous/transport';

export interface MaoAuditTrailPanelProps {
  projectId: ProjectId | null;
}

export function MaoAuditTrailPanel({ projectId }: MaoAuditTrailPanelProps) {
  const utils = trpc.useUtils();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const isSentinel = projectId === SYSTEM_SCOPE_SENTINEL_PROJECT_ID;

  const auditQuery = trpc.mao.getControlAuditHistory.useQuery(
    { projectId: projectId as string },
    { enabled: !!projectId && !isSentinel },
  );

  useEventSubscription({
    channels: ['mao:control-action'],
    onEvent: () => {
      void utils.mao.getControlAuditHistory.invalidate();
    },
    enabled: !!projectId && !isSentinel,
  });

  const entries = auditQuery.data ?? [];

  const mutedText: React.CSSProperties = { color: 'var(--nous-fg-muted)' };

  return (
    <Card>
      <CardHeader style={{ borderBottom: '1px solid var(--nous-border-subtle)' }}>
        <CardTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-md)', fontSize: 'var(--nous-font-size-base)' }}>
          <span>Audit trail</span>
          {entries.length > 0 ? (
            <Badge variant="outline">{entries.length} entries</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)', paddingTop: 'var(--nous-space-lg)', fontSize: 'var(--nous-font-size-sm)' }}>
        {isSentinel ? (
          <p style={mutedText} data-testid="sentinel-indicator">
            System-level agent — audit trail scoped to project context.
          </p>
        ) : auditQuery.isLoading ? (
          <p style={mutedText}>Loading audit history...</p>
        ) : auditQuery.isError ? (
          <p style={mutedText}>
            Failed to load audit history.
          </p>
        ) : entries.length === 0 ? (
          <p style={mutedText}>
            No control actions have been recorded for this project.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)' }}>
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.commandId;

              return (
                <button
                  key={entry.commandId}
                  type="button"
                  style={{
                    width: '100%',
                    borderRadius: 'var(--nous-radius-sm)',
                    border: '1px solid var(--nous-border-subtle)',
                    paddingInline: 'var(--nous-space-md)',
                    paddingBlock: 'var(--nous-space-sm)',
                    textAlign: 'left',
                    transition: 'background-color 0.15s',
                  }}
                  onClick={() =>
                    setExpandedId(isExpanded ? null : entry.commandId)
                  }
                  aria-expanded={isExpanded}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-sm)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
                      <Badge variant="outline">
                        {entry.action.replace(/_/g, ' ')}
                      </Badge>
                      <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                        {entry.actorId}
                      </span>
                    </div>
                    <span style={{ fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                      {new Date(entry.at).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                    {entry.reason}
                  </div>

                  {isExpanded ? (
                    <div style={{ marginTop: 'var(--nous-space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-2xs)', borderTop: '1px solid var(--nous-border-subtle)', paddingTop: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>Command ID:</span>{' '}
                        {entry.commandId}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500 }}>Reason code:</span>{' '}
                        {entry.reasonCode}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500 }}>Resume readiness:</span>{' '}
                        {entry.resumeReadinessStatus}
                      </div>
                      <div>
                        <span style={{ fontWeight: 500 }}>Decision ref:</span>{' '}
                        {entry.decisionRef}
                      </div>
                      {entry.evidenceRefs.length > 0 ? (
                        <div>
                          <span style={{ fontWeight: 500 }}>Evidence refs:</span>{' '}
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
