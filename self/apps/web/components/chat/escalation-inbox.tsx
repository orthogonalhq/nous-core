'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ProjectEscalationQueueSnapshot } from '@nous/shared';
import { trpc } from '@/lib/trpc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MaoNavigationContext } from '@/lib/mao-links';
import { buildMaoReturnHref } from '@/lib/mao-links';

interface EscalationInboxProps {
  queue: ProjectEscalationQueueSnapshot;
  maoContext?: MaoNavigationContext | null;
}

export function EscalationInbox({ queue, maoContext }: EscalationInboxProps) {
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
    <div
      style={{
        borderBottom: '1px solid var(--nous-shell-column-border)',
        background: 'var(--nous-bg-hover)',
        padding: '12px var(--nous-space-2xl)',
      }}
    >
      <div
        style={{
          marginBottom: 'var(--nous-space-xs)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div
          style={{
            fontSize: 'var(--nous-font-size-sm)',
            fontWeight: 'var(--nous-font-weight-medium)',
          }}
        >
          Escalation inbox
        </div>
        <div style={{ display: 'flex', gap: 'var(--nous-space-xs)' }}>
          <Badge variant="outline">{queue.openCount} open</Badge>
          <Badge variant="outline">{queue.urgentCount} urgent</Badge>
        </div>
      </div>
      {maoContext ? (
        <div
          style={{
            marginBottom: '12px',
            borderRadius: 'var(--nous-radius-md)',
            border: '1px solid var(--nous-shell-column-border)',
            background: 'var(--nous-bg-surface)',
            padding: 'var(--nous-space-sm) var(--nous-space-md)',
            fontSize: 'var(--nous-font-size-sm)',
            color: 'var(--nous-text-secondary)',
          }}
        >
          MAO-linked escalation context is active.
          {maoContext.evidenceRef ? ` evidence ${maoContext.evidenceRef}.` : ''}
          <Link
            href={buildMaoReturnHref(maoContext)}
            style={{
              marginLeft: 'var(--nous-space-xs)',
              textDecoration: 'underline',
              textUnderlineOffset: '4px',
            }}
          >
            Return to MAO
          </Link>
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--nous-space-xs)',
        }}
      >
        {queue.items.slice(0, 3).map((item) => (
          <div
            key={item.escalationId}
            style={{
              borderRadius: 'var(--nous-radius-md)',
              border: '1px solid var(--nous-shell-column-border)',
              background: 'var(--nous-bg-surface)',
              padding: 'var(--nous-space-sm) var(--nous-space-md)',
              fontSize: 'var(--nous-font-size-sm)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontWeight: 'var(--nous-font-weight-medium)' }}>{item.title}</div>
                <div style={{ color: 'var(--nous-text-secondary)' }}>{item.message}</div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--nous-space-xs)',
                }}
              >
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
