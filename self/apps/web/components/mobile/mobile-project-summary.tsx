'use client';

import * as React from 'react';
import Link from 'next/link';
import type { MobileOperationsSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MobileProjectSummaryProps {
  snapshot: MobileOperationsSnapshot;
  quickLinks: Array<{
    label: string;
    href: string;
  }>;
}

export function MobileProjectSummary({
  snapshot,
  quickLinks,
}: MobileProjectSummaryProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center justify-between gap-3 text-base">
          <span>{snapshot.project.name}</span>
          <Badge variant="outline">{snapshot.dashboard.health.overallStatus}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground">Runs</div>
            <div className="font-medium">
              {snapshot.dashboard.health.activeRunStatus ?? 'idle'}
            </div>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground">Escalations</div>
            <div className="font-medium">{snapshot.escalationQueue.openCount} open</div>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground">Blocked nodes</div>
            <div className="font-medium">{snapshot.dashboard.health.blockedNodeCount}</div>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs text-muted-foreground">Schedules</div>
            <div className="font-medium">{snapshot.dashboard.health.enabledScheduleCount}</div>
          </div>
        </div>

        {snapshot.dashboard.blockedActions.length ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Blocked actions</div>
            {snapshot.dashboard.blockedActions
              .filter((action) => !action.allowed)
              .slice(0, 3)
              .map((action) => (
                <div
                  key={action.action}
                  className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground"
                >
                  {action.message}
                </div>
              ))}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {quickLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
