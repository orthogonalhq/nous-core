'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import type {
  MaoAgentProjection,
  MaoProjectSnapshot,
  MaoProjectControlAction,
  MaoProjectControlResult,
  ProjectId,
} from '@nous/shared';
import { trpc } from '@nous/transport';
import { MaoInspectPanel } from './mao-inspect-panel';
import { MaoProjectControls } from './mao-project-controls';
import { MaoAuditTrailPanel } from './mao-audit-trail-panel';

export interface MaoInspectPopupProps {
  open: boolean;
  onClose: () => void;
  /** The agent being inspected */
  agent: MaoAgentProjection | null;
  /** Project snapshot for project controls (if available for the agent's project) */
  projectSnapshot: MaoProjectSnapshot | null;
  /** Control mutation pending state */
  controlPending?: boolean;
  /** Last control result */
  lastControlResult?: MaoProjectControlResult | null;
  /** Handler for control requests */
  onRequestControl?: (input: {
    action: MaoProjectControlAction;
    reason: string;
    commandId: string;
  }) => void;
}

export function MaoInspectPopup({
  open,
  onClose,
  agent,
  projectSnapshot,
  controlPending = false,
  lastControlResult = null,
  onRequestControl,
}: MaoInspectPopupProps) {
  // Escape key handler
  React.useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Internal inspect query
  const inspectInput =
    agent != null
      ? {
          projectId: agent.project_id as ProjectId,
          agentId: agent.agent_id,
          workflowRunId: agent.workflow_run_id,
        }
      : undefined;

  const inspectQuery = trpc.mao.getAgentInspectProjection.useQuery(
    inspectInput as any,
    { enabled: open && agent != null },
  );

  // SSR guard
  if (typeof document === 'undefined') return null;
  if (!open) return null;

  const noop = () => {};

  return createPortal(
    <div className="fixed inset-0 z-50" data-testid="inspect-popup">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        data-testid="inspect-popup-backdrop"
      />

      {/* Popup container */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close inspect popup"
          data-testid="inspect-popup-close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Content */}
        <div className="space-y-6 pt-2">
          <MaoInspectPanel
            inspect={inspectQuery.data}
            isLoading={inspectQuery.isLoading}
          />

          {projectSnapshot && onRequestControl ? (
            <MaoProjectControls
              snapshot={projectSnapshot}
              pending={controlPending}
              lastResult={lastControlResult ?? null}
              onRequestControl={onRequestControl}
            />
          ) : null}

          <MaoAuditTrailPanel
            projectId={(agent?.project_id as ProjectId) ?? null}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
