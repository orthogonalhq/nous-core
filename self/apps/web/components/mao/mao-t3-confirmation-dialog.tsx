'use client';

import * as React from 'react';
import type {
  ConfirmationProof,
  ControlAction,
  MaoProjectControlAction,
  ProjectId,
} from '@nous/shared';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

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
  const proofMutation = trpc.opctl.requestConfirmationProof.useMutation({
    onSuccess: (proof) => {
      onConfirm(proof);
    },
  });

  // Escape key handler
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel]);

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

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 300,
        animation: 'var(--nous-modal-enter)',
      }}
      data-testid="t3-confirmation-dialog"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative mx-4 w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 className="text-lg font-semibold">
          Confirm T3 action
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This action requires explicit confirmation before it can proceed.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Action
            </div>
            <div className="mt-1 font-medium">{actionLabel}</div>
          </div>

          {projectName ? (
            <div className="rounded-md border border-border px-3 py-2">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Project
              </div>
              <div className="mt-1">{projectName}</div>
            </div>
          ) : null}

          <div className="rounded-md border border-border px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              Impact
            </div>
            <div className="mt-1 text-sm">
              {IMPACT_LABELS[action]}
            </div>
            {impactSummary ? (
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                <span>active runs: {impactSummary.activeRunCount}</span>
                <span>active agents: {impactSummary.activeAgentCount}</span>
                <span>blocked agents: {impactSummary.blockedAgentCount}</span>
                <span>urgent agents: {impactSummary.urgentAgentCount}</span>
              </div>
            ) : null}
          </div>
        </div>

        {proofMutation.isError ? (
          <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            Failed to obtain confirmation proof. Please try again.
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-3">
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
