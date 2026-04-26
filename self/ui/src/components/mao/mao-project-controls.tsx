'use client';

import * as React from 'react';
import type {
  ControlAction,
  MaoProjectControlAction,
  MaoProjectControlResult,
  MaoProjectSnapshot,
} from '@nous/shared';
import {
  getRequiredTier,
  getTierDisplay,
  type ConfirmationTierDisplay,
} from '@nous/subcortex-opctl';
import { Badge } from '../badge';
import { Button } from '../button';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { ACTION_MAP } from './mao-t3-confirmation-dialog';
import { SEVERITY_TOKEN_TO_CSS_VAR } from './mao-inspect-panel';

// --- WR-162 SP 14 (SUPV-SP14-002 + SUPV-SP14-003 + SUPV-SP14-004) ---
//
// Closed-form per-submission toast taxonomy. The four outcomes form a
// `Record<OpctlSubmitToastOutcome, ToastBody>` admit so closed-enum
// exhaustiveness catches drift at compile time. `classifyOutcome` is the
// closed pure discriminator over `OpctlSubmitResult`'s `status` + `reason_code`
// surface.
export type OpctlSubmitToastOutcome =
  | 'applied'
  | 'rejected'
  | 'blocked_conflict_resolved'
  | 'blocked_other';

export type ToastBody = {
  tone: 'success' | 'error' | 'info' | 'warn';
  body: string;
};

export const TOAST_BODY_BY_OUTCOME: Record<OpctlSubmitToastOutcome, ToastBody> = {
  applied: { tone: 'success', body: 'Command applied' },
  rejected: { tone: 'error', body: 'Command rejected' },
  blocked_conflict_resolved: {
    tone: 'info',
    body: 'Command queued behind another control',
  },
  blocked_other: { tone: 'warn', body: 'Command blocked' },
};

/**
 * Closed pure discriminator over `MaoProjectControlResult` (which mirrors
 * `OpctlSubmitResult` for project-control surfaces). Returns the closed
 * `OpctlSubmitToastOutcome` literal that keys into `TOAST_BODY_BY_OUTCOME`.
 *
 * SP 14 uses `MaoProjectControlResult` (the renderer-side projection) instead
 * of importing `OpctlSubmitResult` directly — the renderer already consumes
 * the projection-side type via `MaoProjectControlsProps.lastResult`.
 */
export function classifyOutcome(
  result: MaoProjectControlResult,
): OpctlSubmitToastOutcome {
  if (result.status === 'applied') return 'applied';
  if (result.status === 'rejected') return 'rejected';
  if (
    result.status === 'blocked' &&
    result.reason_code === 'opctl_conflict_resolved'
  ) {
    return 'blocked_conflict_resolved';
  }
  return 'blocked_other';
}

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

interface ScopeLockBannerState {
  commandId: string;
  action: MaoProjectControlAction;
  submittedAt: string;
}

/**
 * SUPV-SP14-006 — Per-control tier badge. Closed pipeline through SP 7 helpers
 * (`getRequiredTier` → `getTierDisplay`) + SP 13 severity-token CSS-var. The
 * `ACTION_MAP` lookup converts `MaoProjectControlAction` → `ControlAction`.
 *
 * Reference: SDS § Mechanism Choice "tier-badge closed pipeline."
 */
function TierBadge({ action }: { action: MaoProjectControlAction }) {
  const controlAction: ControlAction = ACTION_MAP[action];
  const display: ConfirmationTierDisplay = getTierDisplay(
    getRequiredTier(controlAction),
  );
  return (
    <span
      data-tier-badge={display.level}
      data-tier-severity={display.severity}
      style={{
        marginLeft: 'var(--nous-space-2xs)',
        fontSize: 'var(--nous-font-size-xs)',
        fontWeight: 500,
        color: SEVERITY_TOKEN_TO_CSS_VAR[display.severity],
      }}
    >
      {display.label}
    </span>
  );
}

/**
 * SUPV-SP14-001 — Submit-result-driven scope-lock banner. State derives from
 * the renderer-side submission lifecycle (NOT a `ScopeLockStore` event seam —
 * the seam doesn't exist; Phase 0 audit 0b verified `InMemoryScopeLockStore`
 * has no `EventEmitter`/`emit(`/`.on(` surface). The banner clears on
 * applied/rejected/blocked_other and persists on
 * `blocked_conflict_resolved` (queued) until the next submit.
 *
 * SUPV-SP14-005 — Cancel-queued is a renderer-only abandon-the-promise UX with
 * an honest copy ("Cancellation visual; underlying queued command continues").
 * The data-plane gap is tracked at SUPV-SP14-AI-CANCEL-QUEUED-DATA-PLANE-GAP
 * for phase-close follow-up.
 */
function ScopeLockBanner({
  state,
  onCancelQueued,
}: {
  state: ScopeLockBannerState;
  onCancelQueued: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="scope-lock-banner"
      data-banner-action={state.action}
      data-banner-command-id={state.commandId}
      style={{
        borderRadius: 'var(--nous-radius-sm)',
        border: '1px solid var(--nous-border-subtle)',
        backgroundColor: 'var(--nous-bg-card)',
        paddingInline: 'var(--nous-space-md)',
        paddingBlock: 'var(--nous-space-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--nous-space-sm)',
        fontSize: 'var(--nous-font-size-sm)',
      }}
    >
      <span>
        Command queued: <code data-testid="scope-lock-banner-action">{state.action}</code>
      </span>
      <button
        type="button"
        data-testid="scope-lock-cancel-queued"
        onClick={onCancelQueued}
        style={{
          borderRadius: 'var(--nous-radius-sm)',
          border: '1px solid var(--nous-border-subtle)',
          paddingInline: 'var(--nous-space-sm)',
          paddingBlock: 'var(--nous-space-2xs)',
          fontSize: 'var(--nous-font-size-xs)',
          backgroundColor: 'transparent',
          cursor: 'pointer',
        }}
      >
        Cancel queued
      </button>
    </div>
  );
}

/**
 * SUPV-SP14-003 — Project Toast fallback. Phase 0 Task 0j showed no shared
 * project Toast component exists; we render a minimal renderer-side ephemeral
 * `<div role="status" aria-live="polite">` with auto-dismiss after 4s. When a
 * shared Toast component lands, this resolver migrates without API changes
 * to consumers.
 */
function InlineToast({ toast }: { toast: ToastBody | null }) {
  if (!toast) return null;
  const tonePalette: Record<ToastBody['tone'], { bg: string; fg: string }> = {
    success: { bg: 'rgba(34,197,94,0.1)', fg: 'rgb(34,197,94)' },
    error: { bg: 'rgba(239,68,68,0.1)', fg: 'rgb(239,68,68)' },
    info: { bg: 'rgba(59,130,246,0.1)', fg: 'rgb(59,130,246)' },
    warn: { bg: 'rgba(234,179,8,0.1)', fg: 'rgb(234,179,8)' },
  };
  const palette = tonePalette[toast.tone];
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="project-controls-toast"
      data-toast-tone={toast.tone}
      style={{
        borderRadius: 'var(--nous-radius-sm)',
        border: `1px solid ${palette.fg}`,
        backgroundColor: palette.bg,
        color: palette.fg,
        paddingInline: 'var(--nous-space-md)',
        paddingBlock: 'var(--nous-space-sm)',
        fontSize: 'var(--nous-font-size-sm)',
      }}
    >
      {toast.body}
    </div>
  );
}

const TOAST_AUTO_DISMISS_MS = 4000;

export function MaoProjectControls({
  snapshot,
  pending,
  lastResult,
  onRequestControl,
}: MaoProjectControlsProps) {
  const [reason, setReason] = React.useState('');
  const [scopeLockBanner, setScopeLockBanner] =
    React.useState<ScopeLockBannerState | null>(null);
  const [toast, setToast] = React.useState<ToastBody | null>(null);

  const control = snapshot.controlProjection;
  const activeRunCount = snapshot.workflowRunId ? 1 : 0;
  const reasonTrimmed = reason.trim();

  const pushToast = React.useCallback((body: ToastBody) => {
    setToast(body);
  }, []);

  // Auto-dismiss toast after fixed duration (cleared on unmount or replacement).
  React.useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // SUPV-SP14-002 + SUPV-SP14-004 — Submit-result-driven banner lifecycle.
  // When a new lastResult arrives, classify and dispatch the toast + clear
  // the banner UNLESS the outcome is blocked_conflict_resolved (the queued
  // case — the banner persists to surface the in-flight queued command).
  const lastResultRef = React.useRef<MaoProjectControlResult | null>(null);
  React.useEffect(() => {
    if (!lastResult) return;
    if (lastResult === lastResultRef.current) return;
    lastResultRef.current = lastResult;
    const outcome = classifyOutcome(lastResult);
    pushToast(TOAST_BODY_BY_OUTCOME[outcome]);
    if (outcome !== 'blocked_conflict_resolved') {
      setScopeLockBanner(null);
    }
  }, [lastResult, pushToast]);

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

  const handleSubmit = React.useCallback(
    (action: MaoProjectControlAction) => {
      const commandId = crypto.randomUUID();
      // SUPV-SP14-001 — set the banner pre-submit; lifecycle below clears or
      // persists based on the resulting `lastResult`.
      setScopeLockBanner({
        commandId,
        action,
        submittedAt: new Date().toISOString(),
      });
      onRequestControl({
        action,
        reason: reasonTrimmed,
        commandId,
      });
    },
    [onRequestControl, reasonTrimmed],
  );

  // SUPV-SP14-005 — Renderer-only abandon-the-promise. Underlying queued
  // command continues at the data plane until it applies or fails. Honest UX
  // copy via toast.
  const handleCancelQueued = React.useCallback(() => {
    setScopeLockBanner(null);
    pushToast({
      tone: 'info',
      body:
        'Cancellation visual; underlying queued command continues until it applies or fails per data-plane',
    });
  }, [pushToast]);

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
        {scopeLockBanner !== null ? (
          <ScopeLockBanner
            state={scopeLockBanner}
            onCancelQueued={handleCancelQueued}
          />
        ) : null}

        <InlineToast toast={toast} />

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
            <span key={button.action} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <Button
                disabled={button.disabled || !reasonTrimmed}
                onClick={() => handleSubmit(button.action)}
              >
                {button.label}
              </Button>
              <TierBadge action={button.action} />
            </span>
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
