'use client';

import * as React from 'react';
import type { MobileOperationsSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MobileEscalationListProps {
  snapshot: MobileOperationsSnapshot;
  onAcknowledge: (escalationId: string) => void;
  pending: boolean;
}

export function MobileEscalationList({
  snapshot,
  onAcknowledge,
  pending,
}: MobileEscalationListProps) {
  const acknowledgementBlocked = snapshot.dashboard.blockedActions.find(
    (action) => action.action === 'acknowledge_escalation' && !action.allowed,
  );

  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>Escalations</span>
          <div className="flex gap-2">
            <Badge variant="outline">{snapshot.escalationQueue.openCount} open</Badge>
            <Badge variant="outline">{snapshot.escalationQueue.urgentCount} urgent</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {acknowledgementBlocked ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            {acknowledgementBlocked.message}
          </div>
        ) : null}
        {!snapshot.escalationQueue.items.length ? (
          <p className="text-sm text-muted-foreground">
            No mobile-visible escalations are currently queued for this project.
          </p>
        ) : (
          snapshot.escalationQueue.items.map((item) => (
            <div
              key={item.escalationId}
              className="space-y-3 rounded-md border border-border px-3 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{item.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Badge variant="outline">{item.severity}</Badge>
                  <Badge variant="outline">{item.status}</Badge>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                routes: {item.routeTargets.join(', ')}
              </div>
              {item.status !== 'acknowledged' && item.status !== 'resolved' ? (
                <Button
                  size="sm"
                  disabled={pending || Boolean(acknowledgementBlocked)}
                  onClick={() => onAcknowledge(item.escalationId)}
                >
                  Acknowledge on mobile
                </Button>
              ) : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
