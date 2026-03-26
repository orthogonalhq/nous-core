'use client';

import * as React from 'react';
import type { ProjectBlockedAction, ProjectEscalationQueueSnapshot } from '@nous/shared';
import { useEventSubscription } from '@nous/ui';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ProjectEscalationQueueProps {
  queue: ProjectEscalationQueueSnapshot;
  blockedActions: ProjectBlockedAction[];
}

export function ProjectEscalationQueue({
  queue,
  blockedActions,
}: ProjectEscalationQueueProps) {
  const utils = trpc.useUtils();

  useEventSubscription({
    channels: ['escalation:new', 'escalation:resolved'],
    onEvent: () => {
      void Promise.all([
        utils.escalations.listProjectQueue.invalidate(),
        utils.projects.dashboardSnapshot.invalidate(),
      ]);
    },
  });

  const acknowledge = trpc.escalations.acknowledge.useMutation({
    onSuccess: async (updated) => {
      await Promise.all([
        utils.escalations.listProjectQueue.invalidate({ projectId: updated.projectId }),
        utils.projects.dashboardSnapshot.invalidate({ projectId: updated.projectId }),
      ]);
    },
  });
  const acknowledgementBlocked = blockedActions.find(
    (action) => action.action === 'acknowledge_escalation' && !action.allowed,
  );

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Escalation queue</span>
          <div className="flex gap-2">
            <Badge variant="outline">{queue.openCount} open</Badge>
            <Badge variant="outline">{queue.urgentCount} urgent</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {acknowledgementBlocked ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            {acknowledgementBlocked.message}
          </div>
        ) : null}
        {!queue.items.length ? (
          <p className="text-sm text-muted-foreground">
            No in-app escalations are currently queued for this project.
          </p>
        ) : (
          queue.items.map((item) => (
            <div
              key={item.escalationId}
              className="rounded-md border border-border px-3 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{item.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{item.severity}</Badge>
                  <Badge variant="outline">{item.status}</Badge>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>routes: {item.routeTargets.join(', ')}</span>
                <span>evidence: {item.evidenceRefs[0] ?? 'n/a'}</span>
              </div>
              {item.status !== 'acknowledged' && item.status !== 'resolved' ? (
                <div className="mt-3">
                  <Button
                    size="sm"
                    disabled={acknowledge.isPending || Boolean(acknowledgementBlocked)}
                    onClick={() =>
                      acknowledge.mutate({
                        escalationId: item.escalationId,
                        surface: 'projects',
                        actorType: 'principal',
                        note: 'Acknowledged from Projects',
                      })
                    }
                  >
                    Acknowledge
                  </Button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
