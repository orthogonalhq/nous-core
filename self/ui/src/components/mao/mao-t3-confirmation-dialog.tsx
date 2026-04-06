'use client';

import * as React from 'react';
import type {
  ConfirmationProof,
  ControlAction,
  MaoProjectControlAction,
  ProjectId,
} from '@nous/shared';
import { Button } from '../button';
import { trpc } from '@nous/transport';

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
  onConfirm: (proof: ConfirmationProof) => void;
  onCancel: () => void;
}

export function MaoT3ConfirmationDialog({
  open,
  action,
  projectId,
  projectName,
  impactSummary,
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
        <h2 style={{ fontSize: 'var(--nous-font-size-lg)', fontWeight: 600 }}>
          Confirm T3 action
        </h2>
        <p style={{ marginTop: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-sm)', color: 'var(--nous-fg-muted)' }}>
          This action requires explicit confirmation before it can proceed.
        </p>

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
        </div>

        {proofMutation.isError ? (
          <div style={{ marginTop: 'var(--nous-space-md)', borderRadius: 'var(--nous-radius-sm)', border: '1px solid rgba(239,68,68,0.4)', backgroundColor: 'rgba(239,68,68,0.1)', paddingInline: 'var(--nous-space-md)', paddingBlock: 'var(--nous-space-sm)', fontSize: 'var(--nous-font-size-sm)', color: '#ef4444' }}>
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
