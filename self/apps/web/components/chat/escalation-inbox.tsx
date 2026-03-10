'use client';

import * as React from 'react';
import type { ProjectEscalationQueueSnapshot } from '@nous/shared';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface EscalationInboxProps {
  queue: ProjectEscalationQueueSnapshot;
}

export function EscalationInbox({ queue }: EscalationInboxProps) {
  const utils = trpc.useUtils();
  const acknowledge = trpc.escalations.acknowledge.useMutation({
    onSuccess: async (updated) => {
      await utils.escalations.listProjectQueue.invalidate({ projectId: updated.projectId });
    },
  });

  if (!queue.items.length) {
    return null;
  }

  return (
    <div className="border-b border-border bg-muted/20 px-6 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium">Escalation inbox</div>
        <div className="flex gap-2">
          <Badge variant="outline">{queue.openCount} open</Badge>
          <Badge variant="outline">{queue.urgentCount} urgent</Badge>
        </div>
      </div>
      <div className="space-y-2">
        {queue.items.slice(0, 3).map((item) => (
          <div
            key={item.escalationId}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{item.title}</div>
                <div className="text-muted-foreground">{item.message}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{item.severity}</Badge>
                {item.status !== 'acknowledged' && item.status !== 'resolved' ? (
                  <Button
                    size="sm"
                    onClick={() =>
                      acknowledge.mutate({
                        escalationId: item.escalationId,
                        surface: 'chat',
                        actorType: 'principal',
                        note: 'Acknowledged from Chat',
                      })
                    }
                  >
                    Acknowledge
                  </Button>
                ) : (
                  <Badge variant="outline">{item.status}</Badge>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
