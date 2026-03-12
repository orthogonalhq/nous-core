'use client';

import * as React from 'react';
import type { MobileOperationsSnapshot } from '@nous/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface MobileFollowUpCardProps {
  snapshot: MobileOperationsSnapshot;
}

export function MobileFollowUpCard({ snapshot }: MobileFollowUpCardProps) {
  return (
    <Card>
      <CardHeader className="border-b border-border">
        <CardTitle className="text-base">Follow-up posture</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Voice status</span>
            <Badge variant="outline">
              {snapshot.voiceSession?.current_turn_state ?? 'no_active_session'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {snapshot.voiceSession
              ? `Assistant ${snapshot.voiceSession.assistant_output_state}; continuation ${
                  snapshot.voiceSession.continuation_required ? 'required' : 'not required'
                }.`
              : 'No active voice session is currently projected for this project.'}
          </p>
          {snapshot.voiceSession?.pending_confirmation.required ? (
            <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
              Text confirmation targets:{' '}
              {snapshot.voiceSession.pending_confirmation.text_surface_targets.join(', ')}
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Device trust</span>
            <Badge variant="outline">
              {snapshot.endpointTrust
                ? `${snapshot.endpointTrust.trustedPeripheralCount} trusted`
                : 'no paired devices'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {snapshot.endpointTrust
              ? `${snapshot.endpointTrust.sensoryEndpointCount} sensory endpoints, ${snapshot.endpointTrust.actionEndpointCount} action endpoints, ${snapshot.endpointTrust.activeSessionCount} active sessions.`
              : 'Mobile shows trust posture only when canonical endpoint-trust records exist for this project.'}
          </p>
          {snapshot.endpointTrust?.latestIncidentSeverity ? (
            <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
              Latest trust incident: {snapshot.endpointTrust.latestIncidentSeverity}
              {snapshot.endpointTrust.latestIncidentReasonCode
                ? ` (${snapshot.endpointTrust.latestIncidentReasonCode})`
                : ''}
            </div>
          ) : null}
        </div>

        {snapshot.diagnostics.degradedReasonCode ? (
          <div className="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
            Degraded mobile posture: {snapshot.diagnostics.degradedReasonCode}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
