'use client';

import * as React from 'react';
import type {
  MaoProjectControlAction,
  MaoProjectControlResult,
  MaoProjectSnapshot,
} from '@nous/shared';
import { Badge } from '../badge';
import { Button } from '../button';
import { Card, CardContent, CardHeader, CardTitle } from '../card';

export interface MaoProjectControlsProps {
  snapshot: MaoProjectSnapshot;
  pending: boolean;
  lastResult: MaoProjectControlResult | null;
  onRequestControl: (input: {
    action: MaoProjectControlAction;
    reason: string;
    commandId: string;
  }) => void;
}

export function MaoProjectControls({
  snapshot,
  pending,
  lastResult,
  onRequestControl,
}: MaoProjectControlsProps) {
  const [reason, setReason] = React.useState('');
  const control = snapshot.controlProjection;
  const activeRunCount = snapshot.workflowRunId ? 1 : 0;
  const reasonTrimmed = reason.trim();

  const controlButtons: Array<{
    action: MaoProjectControlAction;
    label: string;
    disabled: boolean;
  }> = [
    {
      action: 'pause_project',
      label: 'Pause Project',
      disabled:
        pending ||
        control.project_control_state === 'paused_review' ||
        control.project_control_state === 'hard_stopped',
    },
    {
      action: 'resume_project',
      label: 'Resume Project',
      disabled: pending || control.project_control_state === 'running',
    },
    {
      action: 'hard_stop_project',
      label: 'Hard Stop Project',
      disabled: pending || control.project_control_state === 'hard_stopped',
    },
  ];

  const cellBase: React.CSSProperties = {
    borderRadius: 'var(--nous-radius-sm)',
    border: '1px solid var(--nous-border-subtle)',
    paddingInline: 'var(--nous-space-md)',
    paddingBlock: 'var(--nous-space-sm)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 'var(--nous-font-size-xs)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--nous-fg-muted)',
  };

  const evidenceBtnStyle: React.CSSProperties = {
    borderRadius: 'var(--nous-radius-sm)',
    border: '1px solid var(--nous-border-subtle)',
    paddingInline: 'var(--nous-space-sm)',
    paddingBlock: 'var(--nous-space-2xs)',
    fontSize: 'var(--nous-font-size-xs)',
  };

  return (
    <Card>
      <CardHeader style={{ borderBottom: '1px solid var(--nous-border-subtle)' }}>
        <CardTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--nous-space-md)', fontSize: 'var(--nous-font-size-base)' }}>
          <span>Project controls</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
            <Badge variant="outline">{control.project_control_state}</Badge>
            <Badge variant="outline">{control.pfc_project_recommendation}</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-lg)', paddingTop: 'var(--nous-space-lg)', fontSize: 'var(--nous-font-size-sm)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)' }}>
          <div style={cellBase}>
            <div style={labelStyle}>Resume readiness</div>
            <div style={{ marginTop: 'var(--nous-space-2xs)' }}>{control.resume_readiness_status}</div>
            {control.resume_readiness_reason_code ? (
              <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                {control.resume_readiness_reason_code}
              </div>
            ) : null}
          </div>
          <div style={cellBase}>
            <div style={labelStyle}>Last action</div>
            <div style={{ marginTop: 'var(--nous-space-2xs)' }}>
              {control.project_last_control_action ?? 'n/a'}
            </div>
            {control.project_last_control_reason ? (
              <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                {control.project_last_control_reason}
              </div>
            ) : null}
          </div>
        </div>

        {/* B2-a: Cortex review status surface */}
        <div style={cellBase} data-testid="cortex-review-section">
          <div style={labelStyle}>Cortex review</div>
          <div style={{ marginTop: 'var(--nous-space-2xs)' }}>
            {control.pfc_project_review_status === 'none'
              ? 'No active Cortex review'
              : control.pfc_project_review_status}
          </div>
        </div>

        {/* B2-b: Evidence links from resume_readiness_evidence_refs */}
        {control.resume_readiness_evidence_refs &&
        control.resume_readiness_evidence_refs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-2xs)' }} data-testid="resume-readiness-evidence">
            <div style={labelStyle}>Resume readiness evidence</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-2xs)' }}>
              {control.resume_readiness_evidence_refs.map((ref) => (
                <button
                  key={ref}
                  type="button"
                  style={evidenceBtnStyle}
                  data-evidence-ref={ref}
                  onClick={() => {
                    /* V1: in-app evidence link placeholder */
                  }}
                >
                  {ref}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div style={{ ...cellBase, padding: 'var(--nous-space-xl)' }}>
          <div style={labelStyle}>Impact summary</div>
          <div style={{ marginTop: 'var(--nous-space-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)' }}>
            <div>active runs: {activeRunCount}</div>
            <div>active agents: {snapshot.summary.activeAgentCount}</div>
            <div>blocked agents: {snapshot.summary.blockedAgentCount}</div>
            <div>urgent agents: {snapshot.summary.urgentAgentCount}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)' }}>
          <label style={{ fontSize: 'var(--nous-font-size-sm)', fontWeight: 500 }} htmlFor="mao-control-reason">
            Control reason
          </label>
          <textarea
            id="mao-control-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Capture the operator reason for this project-scope control."
            style={{
              minHeight: '6rem',
              width: '100%',
              borderRadius: 'var(--nous-radius-sm)',
              border: '1px solid var(--nous-border-subtle)',
              backgroundColor: 'var(--nous-bg)',
              paddingInline: 'var(--nous-space-md)',
              paddingBlock: 'var(--nous-space-sm)',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-sm)' }}>
          {controlButtons.map((button) => (
            <Button
              key={button.action}
              disabled={button.disabled || !reasonTrimmed}
              onClick={() =>
                onRequestControl({
                  action: button.action,
                  reason: reasonTrimmed,
                  commandId: crypto.randomUUID(),
                })
              }
            >
              {button.label}
            </Button>
          ))}
        </div>

        {lastResult ? (
          <div style={cellBase}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--nous-space-sm)' }}>
              <span style={{ fontWeight: 500 }}>Last result</span>
              <Badge variant="outline">{lastResult.status}</Badge>
              <Badge variant="outline">{lastResult.to_state}</Badge>
            </div>
            <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
              {lastResult.reason_code} • {lastResult.decision_ref}
            </div>
            {/* B2-b: Evidence links from lastResult.evidenceRefs */}
            {lastResult.evidenceRefs && lastResult.evidenceRefs.length > 0 ? (
              <div style={{ marginTop: 'var(--nous-space-sm)', display: 'flex', flexWrap: 'wrap', gap: 'var(--nous-space-2xs)' }} data-testid="last-result-evidence">
                {lastResult.evidenceRefs.map((ref) => (
                  <button
                    key={ref}
                    type="button"
                    style={evidenceBtnStyle}
                    data-evidence-ref={ref}
                    onClick={() => {
                      /* V1: in-app evidence link placeholder */
                    }}
                  >
                    {ref}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/*
          * @todo START-005 — Unauthorized start attempt alert surface (project-level).
          * This placeholder reserves the location for a future per-project alert
          * surface that renders unauthorized start attempt events.
          * No runtime behavior. Deferred to follow-on WR.
          */}
        <div data-testid="start-005-stub" aria-hidden="true" style={{ display: 'none' }} />
      </CardContent>
    </Card>
  );
}
