'use client';

import * as React from 'react';
import type {
  MaoAgentProjection,
  MaoProjectControlProjection,
  MaoProjectSnapshot,
  MaoProjectControlAction,
  MaoProjectControlResult,
  ProjectId,
} from '@nous/shared';
import { SYSTEM_SCOPE_SENTINEL_PROJECT_ID } from '@nous/shared';
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
  /** Optional project control projection for system-tab agents */
  projectControlProjection?: MaoProjectControlProjection | null;
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
  /** Resolve dispatching agent UUID to human-readable label */
  resolveAgentLabel?: (agentId: string) => string;
}

export function MaoInspectPopup({
  open,
  onClose,
  agent,
  projectSnapshot,
  projectControlProjection,
  controlPending = false,
  lastControlResult = null,
  onRequestControl,
  resolveAgentLabel,
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

  // Derive effective project snapshot: use provided snapshot or construct minimal from control projection
  const effectiveProjectSnapshot = React.useMemo<MaoProjectSnapshot | null>(() => {
    if (projectSnapshot) return projectSnapshot;
    if (
      !projectControlProjection ||
      !agent ||
      agent.project_id === SYSTEM_SCOPE_SENTINEL_PROJECT_ID
    ) {
      return null;
    }
    // Construct minimal snapshot from control projection (SDS D2)
    return {
      projectId: agent.project_id,
      densityMode: 'D2',
      controlProjection: projectControlProjection,
      grid: [],
      graph: {
        projectId: agent.project_id,
        nodes: [],
        edges: [],
        generatedAt: new Date().toISOString(),
      },
      urgentOverlay: {
        urgentAgentIds: [],
        blockedAgentIds: [],
        generatedAt: new Date().toISOString(),
      },
      summary: {
        activeAgentCount: projectControlProjection.active_agent_count,
        blockedAgentCount: projectControlProjection.blocked_agent_count,
        failedAgentCount: 0,
        waitingPfcAgentCount: 0,
        urgentAgentCount: projectControlProjection.urgent_agent_count,
      },
      diagnostics: { runtimePosture: 'single_process_local' as const },
      generatedAt: new Date().toISOString(),
    } as MaoProjectSnapshot;
  }, [projectSnapshot, projectControlProjection, agent]);

  if (!open) return null;

  const noop = () => {};

  return (
    <div
      data-testid="inspect-popup"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: 'inherit',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        data-testid="inspect-popup-backdrop"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      />

      {/* Popup container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '42rem',
          maxHeight: 'calc(100% - 2rem)',
          margin: '1rem',
          overflowY: 'auto',
          borderRadius: 'var(--nous-radius-xl, 12px)',
          border: '1px solid var(--nous-border)',
          background: 'var(--nous-bg-surface, var(--nous-bg))',
          padding: 'var(--nous-space-3xl)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspect popup"
          data-testid="inspect-popup-close"
          style={{
            position: 'absolute',
            right: 'var(--nous-space-lg)',
            top: 'var(--nous-space-lg)',
            padding: 'var(--nous-space-xs)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--nous-text-secondary)',
            borderRadius: 'var(--nous-radius-sm, 4px)',
          }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--nous-space-3xl)', paddingTop: 'var(--nous-space-sm)' }}>
          <MaoInspectPanel
            inspect={inspectQuery.data}
            isLoading={inspectQuery.isLoading}
            resolveAgentLabel={resolveAgentLabel}
          />

          {effectiveProjectSnapshot && onRequestControl ? (
            <MaoProjectControls
              snapshot={effectiveProjectSnapshot}
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
    </div>
  );
}
