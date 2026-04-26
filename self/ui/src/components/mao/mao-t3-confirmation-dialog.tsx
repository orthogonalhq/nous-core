'use client';

import * as React from 'react';
import type {
  ConfirmationProof,
  ControlAction,
  MaoProjectControlAction,
  ProjectId,
} from '@nous/shared';
import {
  getTierDisplay,
  type ConfirmationTierDisplay,
} from '@nous/subcortex-opctl';
import { Button } from '../button';
import { trpc } from '@nous/transport';
import { SEVERITY_TOKEN_TO_CSS_VAR } from './mao-inspect-panel';

/**
 * T3 actions that require a confirmation dialog before mutation.
 * Mirrors `mapAction()` in mao-projection-service.ts:99-111.
 */
export const T3_ACTIONS: ReadonlySet<MaoProjectControlAction> = new Set([
  'resume_project',
  'hard_stop_project',
]);

/**
 * Maps MaoProjectControlAction to ControlAction for proof request construction.
 * Must stay in sync with `mapAction()` in mao-projection-service.ts.
 */
export const ACTION_MAP: Record<MaoProjectControlAction, ControlAction> = {
  pause_project: 'pause',
  resume_project: 'resume',
  hard_stop_project: 'hard_stop',
};

const IMPACT_LABELS: Record<MaoProjectControlAction, string> = {
  pause_project: 'Pause all active runs and agents for this project.',
  resume_project:
    'Resume this project from its paused or stopped state. All agents will be re-dispatched.',
  hard_stop_project:
    'Immediately halt all activity for this project. Active agents will be terminated.',
};

// --- WR-162 SP 14 SUPV-SP14-011 — closed RationaleKey + supervisor-state resolver ---
//
// Closed `Record<RationaleKey, string>` covers the four tier rationales plus the
// supervisor-locked T3 variant (per ESC-001 acknowledgment outcome at Goals SC-11).
// `resolveRationaleCopy` is the closed pure resolver: when a T3 dialog is shown
// against a supervisor-locked scope (`MaoAgentProjection.guardrail_status ===
// 'enforced'` per SP 6 read), the supervisor-locked copy renders.
export type RationaleKey =
  | 'tier.t0.rationale'
  | 'tier.t1.rationale'
  | 'tier.t2.rationale'
  | 'tier.t3.rationale'
  | 'tier.t3.supervisor_locked';

export const RATIONALE_COPY: Record<RationaleKey, string> = {
  'tier.t0.rationale':
    'Immediate execution. No additional confirmation required.',
  'tier.t1.rationale':
    'One-step confirmation. The action proceeds once you confirm.',
  'tier.t2.rationale':
    'Two-step confirmation. Review the impact summary before confirming.',
  'tier.t3.rationale':
    'Cooldown-gated confirmation. Destructive scope requires explicit acknowledgment.',
  'tier.t3.supervisor_locked':
    'Supervisor lock active (ESC-001). Acknowledge the supervisor-enforced state before this destructive action proceeds.',
};

export function resolveRationaleCopy(
  rationaleKey: RationaleKey,
  supervisorLocked: boolean,
): string {
  if (supervisorLocked && rationaleKey === 'tier.t3.rationale') {
    return RATIONALE_COPY['tier.t3.supervisor_locked'];
  }
  return RATIONALE_COPY[rationaleKey];
}

/**
 * SUPV-SP14-012 — Closed conditional cooldown structure. V1 `T3_COOLDOWN_MS = 0`
 * means the countdown is not rendered today. The closed conditional is forward-
 * compatible: when SP 7 promotes `T3_COOLDOWN_MS` to a positive value, the
 * countdown wires up automatically without component-shape change.
 */
function Countdown({ ms }: { ms: number }) {
  const [remaining, setRemaining] = React.useState(ms);
  React.useEffect(() => {
    setRemaining(ms);
    if (ms <= 0) return;
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const next = Math.max(0, ms - elapsed);
      setRemaining(next);
      if (next <= 0) clearInterval(interval);
    }, 100);
    return () => clearInterval(interval);
  }, [ms]);
  return (
    <span data-testid="t3-cooldown" data-cooldown-remaining-ms={remaining}>
      Cooldown: {Math.ceil(remaining / 1000)}s
    </span>
  );
}

export interface MaoT3ConfirmationDialogProps {
  open: boolean;
  action: MaoProjectControlAction;
  projectId: ProjectId;
  projectName?: string;
  impactSummary?: {
    activeRunCount: number;
    activeAgentCount: number;
    blockedAgentCount: number;
    urgentAgentCount: number;
  };
  /**
   * SUPV-SP14-011 — Optional supervisor-locked-scope flag derived by parent
   * from `MaoAgentProjection.guardrail_status === 'enforced'` (SP 6 read).
   * Defaults to `false`; existing consumers see no behavior change. DNR-J1
   * holds: this is an additive optional prop justified at SDS.
   */
  supervisorLocked?: boolean;
  /**
   * SUPV-SP14-013 — Optional last-submission result. When `reason_code` is
   * non-undefined, the dialog renders the reason-code surface in the dialog
   * body. Renders nothing otherwise. Additive optional prop (DNR-J1).
   */
  result?: {
    reason_code?: string;
  };
  onConfirm: (proof: ConfirmationProof) => void;
  onCancel: () => void;
}

export function MaoT3ConfirmationDialog({
  open,
  action,
  projectId,
  projectName,
  impactSummary,
  supervisorLocked,
  result,
  onConfirm,
  onCancel,
}: MaoT3ConfirmationDialogProps) {
  const [confirmedProof, setConfirmedProof] =
    React.useState<ConfirmationProof | null>(null);

  const proofMutation = trpc.opctl.requestConfirmationProof.useMutation({
    onSuccess: (proof) => {
      setConfirmedProof(proof);
    },
  });

  // SUPV-SP14-008 — `useMemo` over `getTierDisplay('T3')`. The resolver is
  // pure but stable across renders; memoizing avoids redundant work and pins
  // the closed `display.label` / `display.severity` / `display.rationaleKey`
  // / `display.cooldownMs` surface for the rest of the render tree.
  const display: ConfirmationTierDisplay = React.useMemo(
    () => getTierDisplay('T3'),
    [],
  );

  // SUPV-SP14-011 — supervisor-locked rationale copy (closed Record over
  // five-literal `RationaleKey` admit).
  const rationaleCopy = resolveRationaleCopy(
    display.rationaleKey as RationaleKey,
    supervisorLocked ?? false,
  );

  // Reset proof display state when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setConfirmedProof(null);
    }
  }, [open]);

  // Escape key handler
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (confirmedProof) {
          // If proof is displayed, Escape dismisses without executing
          onCancel();
        } else {
          onCancel();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel, confirmedProof]);

  if (!open) return null;

  const controlAction = ACTION_MAP[action];
  const actionLabel = action.replace(/_/g, ' ');

  const handleConfirm = () => {
    proofMutation.mutate({
      scope: {
        class: 'project_run_scope',
        kind: 'project_run',
        target_ids: [],
        project_id: projectId,
      },
      action: controlAction,
      tier: 'T3',
    });
  };

  const handleDone = () => {
    if (confirmedProof) {
      onConfirm(confirmedProof);
      setConfirmedProof(null);
    }
  };

  const overlayBase: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
    animation: 'var(--nous-modal-enter)',
  };

  const backdropStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  };

  const panelStyle: React.CSSProperties = {
    position: 'relative',
    marginInline: 'var(--nous-space-2xl)',
    width: '100%',
    maxWidth: '28rem',
    borderRadius: 'var(--nous-radius-md)',
    border: '1px solid var(--nous-border-subtle)',
    backgroundColor: 'var(--nous-bg)',
    padding: 'var(--nous-space-3xl)',
    boxShadow: 'var(--nous-shadow-lg)',
  };

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

  // Proof display view — shown after confirmation proof is obtained
  if (confirmedProof) {
    return (
      <div style={overlayBase} data-testid="t3-confirmation-dialog">
        <div style={backdropStyle} onClick={onCancel} aria-hidden="true" />
        <div style={panelStyle}>
          <h2 style={{ fontSize: 'var(--nous-font-size-lg)', fontWeight: 600 }}>
            Proof confirmed
          </h2>
          <p style={{ marginTop: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
            Confirmation proof obtained. Review details below, then click Done to
            execute the control action.
          </p>

          <div style={{ marginTop: 'var(--nous-space-2xl)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)' }} data-testid="proof-details">
            <div style={cellBase}>
              <div style={labelStyle}>Proof ID</div>
              <div style={{ marginTop: 'var(--nous-space-2xs)', fontFamily: 'var(--nous-font-family-mono)', fontSize: 'var(--nous-font-size-xs)' }} data-testid="proof-id">
                {confirmedProof.proof_id}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)' }}>
              <div style={cellBase}>
                <div style={labelStyle}>Issued at</div>
                <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)' }}>
                  {new Date(confirmedProof.issued_at).toLocaleString()}
                </div>
              </div>
              <div style={cellBase}>
                <div style={labelStyle}>Expires at</div>
                <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)' }}>
                  {new Date(confirmedProof.expires_at).toLocaleString()}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-sm)' }}>
              <div style={cellBase}>
                <div style={labelStyle}>Tier</div>
                <div style={{ marginTop: 'var(--nous-space-2xs)' }}>{confirmedProof.tier}</div>
              </div>
              <div style={cellBase}>
                <div style={labelStyle}>Action</div>
                <div style={{ marginTop: 'var(--nous-space-2xs)' }}>{confirmedProof.action}</div>
              </div>
            </div>
            <div style={cellBase}>
              <div style={labelStyle}>Scope hash</div>
              <div style={{ marginTop: 'var(--nous-space-2xs)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--nous-font-family-mono)', fontSize: 'var(--nous-font-size-xs)' }}>
                {confirmedProof.scope_hash}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'var(--nous-space-3xl)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--nous-space-md)' }}>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleDone} data-testid="proof-done-button">
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayBase} data-testid="t3-confirmation-dialog">
      <div style={backdropStyle} onClick={onCancel} aria-hidden="true" />
      <div style={panelStyle}>
        <h2
          style={{
            fontSize: 'var(--nous-font-size-lg)',
            fontWeight: 600,
            // SUPV-SP14-008 — severity-token replaces inline `'#ef4444'` hardcode.
            color: SEVERITY_TOKEN_TO_CSS_VAR[display.severity],
          }}
        >
          Confirm T3 action
        </h2>
        {/* SUPV-SP14-008 — `display.label` thread (sibling node preserves the
            DNR-H1 `'Confirm T3 action'` heading verbatim per SC-39). */}
        <div
          data-testid="t3-tier-label"
          data-tier-level={display.level}
          data-tier-severity={display.severity}
          style={{
            marginTop: 'var(--nous-space-2xs)',
            fontSize: 'var(--nous-font-size-sm)',
            color: SEVERITY_TOKEN_TO_CSS_VAR[display.severity],
            fontWeight: 500,
          }}
        >
          {display.label}
        </div>
        <p
          style={{ marginTop: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}
          data-testid="t3-rationale-copy"
          data-rationale-key={display.rationaleKey}
          data-supervisor-locked={(supervisorLocked ?? false) ? 'true' : 'false'}
        >
          {rationaleCopy}
        </p>

        {display.cooldownMs !== undefined && display.cooldownMs > 0 ? (
          <div style={{ marginTop: 'var(--nous-space-md)' }}>
            <Countdown ms={display.cooldownMs} />
          </div>
        ) : null}

        <div style={{ marginTop: 'var(--nous-space-2xl)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-md)' }}>
          <div style={cellBase}>
            <div style={labelStyle}>Action</div>
            <div style={{ marginTop: 'var(--nous-space-2xs)', fontWeight: 500 }}>{actionLabel}</div>
          </div>

          {projectName ? (
            <div style={cellBase}>
              <div style={labelStyle}>Project</div>
              <div style={{ marginTop: 'var(--nous-space-2xs)' }}>{projectName}</div>
            </div>
          ) : null}

          <div style={cellBase}>
            <div style={labelStyle}>Impact</div>
            <div style={{ marginTop: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-sm)' }}>
              {IMPACT_LABELS[action]}
            </div>
            {impactSummary ? (
              <div style={{ marginTop: 'var(--nous-space-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-2xs)', fontSize: 'var(--nous-font-size-xs)', color: 'var(--nous-fg-muted)' }}>
                <span>active runs: {impactSummary.activeRunCount}</span>
                <span>active agents: {impactSummary.activeAgentCount}</span>
                <span>blocked agents: {impactSummary.blockedAgentCount}</span>
                <span>urgent agents: {impactSummary.urgentAgentCount}</span>
              </div>
            ) : null}
          </div>

          {/* SUPV-SP14-013 — Reason-code surface. Renders only when result?.reason_code is non-undefined. */}
          {result?.reason_code !== undefined ? (
            <dl
              data-testid="t3-reason-code"
              style={{
                ...cellBase,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--nous-space-2xs)',
              }}
            >
              <dt style={labelStyle}>Reason</dt>
              <dd style={{ margin: 0, fontSize: 'var(--nous-font-size-sm)' }}>
                {result.reason_code}
              </dd>
            </dl>
          ) : null}
        </div>

        {proofMutation.isError ? (
          <div
            style={{
              marginTop: 'var(--nous-space-md)',
              borderRadius: 'var(--nous-radius-sm)',
              border: '1px solid rgba(239,68,68,0.4)',
              backgroundColor: 'rgba(239,68,68,0.1)',
              paddingInline: 'var(--nous-space-md)',
              paddingBlock: 'var(--nous-space-sm)',
              fontSize: 'var(--nous-font-size-sm)',
              // SUPV-SP14-008 — severity-token replaces inline `'#ef4444'` hardcode.
              color: SEVERITY_TOKEN_TO_CSS_VAR[display.severity],
            }}
          >
            Failed to obtain confirmation proof. Please try again.
          </div>
        ) : null}

        <div style={{ marginTop: 'var(--nous-space-3xl)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--nous-space-md)' }}>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={proofMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={proofMutation.isPending}
          >
            {proofMutation.isPending ? 'Confirming...' : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
